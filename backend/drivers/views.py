from decimal import Decimal
from django.db import transaction
from django.contrib.auth.hashers import make_password, check_password
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    permission_classes,
    authentication_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.utils import timezone
from django.db import models
from datetime import timedelta
from .models import DriverProfile, PastDriver
from .serializers import DriverProfileSerializer
from rides.models import Ride
from rides.serializers import RideSerializer
from notifications.utils import create_notification, create_driver_notification
from .authentication import DriverTokenAuthentication, DriverUser
from wallet.models import DriverWallet, DriverTransaction, Transaction
import json


# ── Constants ──────────────────────────────────────────────
CANCELLATION_PENALTY = Decimal("25.00")


def create_driver_snapshot(driver, request=None):
    """Return a JSON-serializable snapshot of the driver."""
    from django.forms.models import model_to_dict

    # Include all concrete fields from the model
    field_names = [f.name for f in driver._meta.fields]
    snapshot = model_to_dict(driver, fields=field_names)

    # Include avatar URL if request is provided
    if request and hasattr(driver, "avatar") and driver.avatar:
        try:
            snapshot["avatar_url"] = request.build_absolute_uri(driver.avatar.url)
        except Exception:
            snapshot["avatar"] = getattr(driver.avatar, "name", None)

    return snapshot


def require_driver(request):
    """
    Returns the DriverProfile for the authenticated driver, or None.
    Works with DriverTokenAuthentication (request.user is a DriverUser wrapper).
    """
    if not isinstance(request.user, DriverUser):
        return None
    try:
        return DriverProfile.objects.get(id=request.user.id)
    except DriverProfile.DoesNotExist:
        return None


# GET/PUT/DELETE /api/driver/profile/
@api_view(["GET", "PUT", "DELETE"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def driver_profile(request):
    dp = require_driver(request)
    if not dp:
        return Response(
            {"error": "Not authorized. Driver token required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if request.method == "GET":
        return Response(DriverProfileSerializer(dp, context={"request": request}).data)

    # DELETE — delete account (archive then remove)
    if request.method == "DELETE":
        try:
            # Create snapshot and store in PastDriver
            snapshot = create_driver_snapshot(dp, request)

            PastDriver.objects.create(
                original_id=dp.id,
                email=dp.email,
                name=dp.name,
                first_name=dp.first_name,
                last_name=dp.last_name,
                last_login=dp.last_login,
                phone=dp.phone,
                gender=dp.gender,
                date_of_birth=dp.date_of_birth,
                avatar=(dp.avatar.name if dp.avatar else None),
                role=dp.role,
                vehicle_type=dp.vehicle_type,
                vehicle_model=dp.vehicle_model,
                vehicle_plate=dp.vehicle_plate,
                license_no=dp.license_no,
                total_rides=dp.total_rides,
                total_earnings=dp.total_earnings,
                rating=dp.rating,
                created_at=dp.created_at,
                updated_at=dp.updated_at,
                data=json.dumps(snapshot, default=str),
            )
        except Exception as e:
            import logging

            logging.getLogger(__name__).error("Failed to archive driver: %s", str(e))

        dp.delete()
        return Response({"message": "Driver account archived and deleted."})

    # Handle file removal explicitly before validation (passed as null or "" from frontend)
    if "avatar" in request.data and (
        request.data["avatar"] == "" or request.data["avatar"] is None
    ):
        if dp.avatar:
            dp.avatar.delete(save=False)
        dp.avatar = None

    # Handle Base64 Upload
    avatar_data = request.data.get("avatar")
    if (
        avatar_data
        and isinstance(avatar_data, str)
        and avatar_data.startswith("data:image")
    ):
        try:
            import base64
            from django.core.files.base import ContentFile

            format, imgstr = avatar_data.split(";base64,")
            ext = format.split("/")[-1]
            # Delete old file before saving new one
            if dp.avatar:
                dp.avatar.delete(save=False)
            dp.avatar = ContentFile(
                base64.b64decode(imgstr), name=f"driver_avatar_{dp.id}.{ext}"
            )

            # CRITICAL: Clean up request data so serializer doesn't try to validate the string as a file
            new_data = request.data.copy()
            new_data.pop("avatar")
            serializer = DriverProfileSerializer(
                dp, data=new_data, partial=True, context={"request": request}
            )
        except Exception as e:
            return Response(
                {"error": "Invalid image format."}, status=status.HTTP_400_BAD_REQUEST
            )
    else:
        serializer = DriverProfileSerializer(
            dp, data=request.data, partial=True, context={"request": request}
        )

    if serializer.is_valid():
        # Handle standard multipart uploads
        if "avatar" in request.FILES:
            if dp.avatar:
                dp.avatar.delete(save=False)
            dp.avatar = request.FILES["avatar"]

        serializer.save()
        return Response(
            {
                "message": "Driver profile updated.",
                "profile": DriverProfileSerializer(
                    dp, context={"request": request}
                ).data,
            }
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# POST /api/driver/toggle-online/
@api_view(["POST"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def toggle_online(request):
    dp = require_driver(request)
    if not dp:
        return Response(
            {"error": "Not authorized. Driver token required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # SECURE: Prevent suspended or inactive drivers from going online
    if not dp.is_online and dp.status != "active":
        return Response(
            {
                "error": f"Your account is currently {dp.status}. Please contact support."
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    if not dp.is_online and dp.profile_completion_percentage < 100:
        return Response(
            {
                "error": "Please complete your profile 100% before going online. This is required for security and verification."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        dp.is_online = not dp.is_online
        dp.save(update_fields=["is_online"])

        status_str = "Online" if dp.is_online else "Offline"
        return Response(
            {"message": f"You are now {status_str}.", "is_online": dp.is_online}
        )
    except Exception as e:
        return Response(
            {"error": "Failed to update status. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# GET /api/driver/pending-rides/
@api_view(["GET"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def pending_rides(request):
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    if dp.status != "active":
        return Response([])  # Return empty if suspended or inactive

    if dp.profile_completion_percentage < 100:
        return Response([])  # Return empty if profile not complete

    now = timezone.now()

    # Show rides that are:
    # 1. status = "pending"
    # 2. vehicle_type matches driver's vehicle type
    # 3. NOT scheduled in the future (or within 15 min of scheduled_at)
    rides = (
        Ride.objects.filter(status="pending", vehicle_type=dp.vehicle_type)
        .filter(
            models.Q(scheduled_at__isnull=True)
            | models.Q(scheduled_at__lte=now + timedelta(minutes=15))
        )
        .order_by("-created_at")[:10]
    )

    return Response(RideSerializer(rides, many=True).data)


# POST /api/driver/rides/{id}/accept/
@api_view(["POST"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def accept_ride(request, pk):
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    if dp.status != "active":
        return Response(
            {"error": "Your account is not active. Please contact support."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if dp.profile_completion_percentage < 100:
        return Response(
            {"error": "You must complete your profile 100% to accept rides."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        ride = Ride.objects.select_for_update().get(pk=pk, status="pending")
    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not available anymore."}, status=status.HTTP_404_NOT_FOUND
        )

    # ── Self-Booking Fraud Prevention ──
    # Check if driver is trying to accept their own ride using a different account
    # if ride.rider.email == dp.email or ride.rider.phone == dp.phone:
    #     return Response(
    #         {"error": "Fraud detected: You cannot accept your own ride request."},
    #         status=status.HTTP_403_FORBIDDEN,
    #     )

    ride.driver = dp
    ride.status = "accepted"  # ← NOT "in_progress" — that happens on start
    ride.accepted_at = timezone.now()
    ride.save()

    create_notification(
        user=ride.rider,
        title="Driver Found! 🚗",
        message=f"{dp.name} is heading to your pickup in a {dp.vehicle_model} ({dp.vehicle_plate}).",
        notif_type="ride",
    )

    return Response({"message": "Ride accepted.", "ride": RideSerializer(ride).data})


# POST /api/driver/rides/{id}/start/
@api_view(["POST"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def start_ride(request, pk):
    """Driver starts the ride after arriving at pickup."""
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    if dp.status != "active":
        return Response(
            {"error": "Account suspended. Cannot start rides."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        ride = Ride.objects.get(pk=pk, driver=dp, status="accepted")
    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found or not in accepted state."},
            status=status.HTTP_404_NOT_FOUND,
        )

    ride.status = "in_progress"
    ride.started_at = timezone.now()
    ride.save()

    create_notification(
        user=ride.rider,
        title="Ride Started! 🚀",
        message="You're on your way. Enjoy the ride!",
        notif_type="ride",
    )

    return Response({"message": "Ride started.", "ride": RideSerializer(ride).data})


# POST /api/driver/rides/{id}/decline/
@api_view(["POST"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def decline_ride(request, pk):
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    if dp.status != "active":
        return Response(
            {"error": "Account suspended."},
            status=status.HTTP_403_FORBIDDEN,
        )

    return Response({"message": "Ride declined."})


# POST /api/driver/rides/{id}/complete/
@api_view(["POST"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
@transaction.atomic
def complete_ride(request, pk):
    """Mark ride as completed and credit driver earnings."""
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    if dp.status != "active":
        return Response(
            {"error": "Account suspended. Cannot complete payment."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        from rides.models import Ride

        ride = Ride.objects.select_for_update().get(
            pk=pk, driver=dp, status="in_progress"
        )
    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found or not in progress by you."},
            status=status.HTTP_404_NOT_FOUND,
        )

    ride.status = "completed"
    ride.completed_at = timezone.now()
    ride.save()

    # Update driver stats — refetch with lock
    dp = DriverProfile.objects.select_for_update().get(id=dp.id)
    dp.total_rides += 1
    # Only increment earnings if already paid (e.g. Wallet)
    # For UPI and Cash, earnings are credited when payment is confirmed paid.
    if ride.payment_status == "paid":
        dp.add_earnings(ride.fare, ride=ride)
    else:
        dp.save(update_fields=["total_rides"])

    # Notification to rider based on payment method
    if ride.payment_method == "wallet":
        pay_msg = "Please complete payment via wallet."
    elif ride.payment_method == "upi":
        pay_msg = "Please complete UPI payment."
    else:
        pay_msg = "Please pay the driver in cash."

    create_notification(
        user=ride.rider,
        title="Ride Completed! 🎉",
        message=f"You've arrived! Fare: ₹{ride.fare}. {pay_msg}",
        notif_type="ride",
    )

    create_driver_notification(
        driver=dp,
        title="Ride Completed! 💰",
        message=f"Ride #{ride.id} completed. Fare: ₹{ride.fare}.",
        notif_type="ride",
    )

    return Response({"message": "Ride completed.", "ride": RideSerializer(ride).data})


# POST /api/driver/rides/{id}/cancel/
@api_view(["POST"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def driver_cancel_ride(request, pk):
    """Driver cancels an accepted ride. Compensates rider with ₹25."""
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    try:
        ride = Ride.objects.get(pk=pk, driver=dp, status="accepted")
    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found or not in accepted state."},
            status=status.HTTP_404_NOT_FOUND,
        )

    ride.cancelled_by = "driver"
    ride.cancel_reason = request.data.get("reason", "")
    ride.cancellation_fee = CANCELLATION_PENALTY

    # ── Compensate rider ₹25 (Locked) ──
    try:
        from wallet.models import Wallet, Transaction

        with transaction.atomic():
            rider_wallet = Wallet.objects.select_for_update().get(
                id=ride.rider.wallet.id
            )
            rider_wallet.balance += CANCELLATION_PENALTY
            rider_wallet.save()
            Transaction.objects.create(
                wallet=rider_wallet,
                txn_type="credit",
                amount=CANCELLATION_PENALTY,
                description=f"Compensation: driver cancelled Ride #{ride.id}",
            )
    except Exception:
        pass

    # ── Deduct from driver wallet ──
    try:
        driver_wallet = dp.wallet
        if driver_wallet.balance >= CANCELLATION_PENALTY:
            driver_wallet.balance -= CANCELLATION_PENALTY
            driver_wallet.save()
            DriverTransaction.objects.create(
                wallet=driver_wallet,
                ride=ride,
                txn_type="debit",
                amount=CANCELLATION_PENALTY,
                description=f"Cancellation penalty for Ride #{ride.id}",
            )
    except Exception:
        pass

    # Put ride back to pending so another driver can pick it up
    ride.driver = None
    ride.status = "pending"
    ride.accepted_at = None
    ride.save()

    create_notification(
        user=ride.rider,
        title="Driver Cancelled 😔",
        message=f"Your driver cancelled. ₹{CANCELLATION_PENALTY} credited as compensation. Finding another driver...",
        notif_type="ride",
    )

    return Response(
        {
            "message": "Ride cancelled. Penalty applied.",
            "ride": RideSerializer(ride).data,
            "penalty": float(CANCELLATION_PENALTY),
        }
    )


# POST /api/driver/rides/{id}/confirm-cash/
@api_view(["POST"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
@transaction.atomic
def confirm_cash_payment(request, pk):
    """Driver confirms cash payment received from rider."""
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    try:
        # Obtain row lock to prevent race conditions
        ride = Ride.objects.select_for_update().get(
            pk=pk, driver=dp, status="completed", payment_method="cash"
        )
    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found or not eligible for cash confirmation."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if ride.payment_status == "paid":
        return Response(
            {"error": "Payment already confirmed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Credit driver wallet (track earnings)
    dp.add_earnings(
        ride.fare, ride=ride, description=f"Cash received for Ride #{ride.id}"
    )

    ride.payment_status = "paid"
    ride.save(update_fields=["payment_status"])

    create_notification(
        user=ride.rider,
        title="Cash Payment Confirmed ✅",
        message=f"Driver confirmed ₹{ride.fare} cash received for Ride #{ride.id}.",
        notif_type="payment",
    )

    return Response(
        {
            "message": "Cash payment confirmed.",
            "ride": RideSerializer(ride).data,
        }
    )


# GET /api/driver/stats/
@api_view(["GET"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def driver_stats(request):
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    from datetime import date

    today_rides = Ride.objects.filter(
        driver=dp, status="completed", completed_at__date=date.today()
    )
    today_earnings = sum(r.fare for r in today_rides)

    # Get driver wallet balance
    wallet_balance = Decimal("0")
    try:
        wallet_balance = dp.wallet.balance
    except Exception:
        pass

    return Response(
        {
            "total_earnings": dp.total_earnings,
            "today_earnings": today_earnings,
            "total_rides": dp.total_rides,
            "today_rides": today_rides.count(),
            "rating": dp.rating,
            "is_online": dp.is_online,
            "wallet_balance": float(wallet_balance),
        }
    )


# GET /api/driver/wallet/
@api_view(["GET"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def driver_wallet_detail(request):
    """Get driver wallet details."""
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    try:
        from wallet.models import DriverWallet
        from wallet.serializers import DriverWalletSerializer

        wallet, _ = DriverWallet.objects.get_or_create(driver=dp)
        return Response(DriverWalletSerializer(wallet).data)
    except Exception as e:
        return Response({"balance": 0, "transactions": [], "has_pin": False, "is_frozen": False})


# GET /api/driver/wallet/transactions/
@api_view(["GET"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def driver_wallet_transactions(request):
    """Get driver wallet transaction history."""
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    try:
        from wallet.serializers import DriverTransactionSerializer

        wallet = dp.wallet
        txns = wallet.transactions.all()
        return Response(
            {"transactions": DriverTransactionSerializer(txns, many=True).data}
        )
    except Exception:
        return Response({"transactions": []})


# POST /api/driver/wallet/add/
@api_view(["POST"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def driver_add_money(request):
    """Allow driver to top up their earnings wallet (simulated)."""
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    wallet, _ = DriverWallet.objects.get_or_create(driver=dp)
    if wallet.is_frozen:
        return Response(
            {"error": "Wallet is frozen. Cannot performing transactions."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    amount = Decimal(str(request.data.get("amount", 0)))
    method = request.data.get("transaction_method", "card")

    if amount <= 0:
        return Response(
            {"error": "Invalid amount."}, status=status.HTTP_400_BAD_REQUEST
        )

    with transaction.atomic():
        wallet, _ = DriverWallet.objects.select_for_update().get_or_create(driver=dp)
        wallet.balance += amount
        wallet.save()

        DriverTransaction.objects.create(
            wallet=wallet,
            txn_type="credit",
            amount=amount,
            description=f"Added funds via {method.upper()}",
        )

    create_driver_notification(
        driver=dp,
        title="Funds Added! 💳",
        message=f"₹{amount} successfully added to your earnings wallet.",
        notif_type="payment",
    )

    return Response(
        {"message": f"Successfully added ₹{amount}", "balance": float(wallet.balance)}
    )


# POST /api/driver/wallet/withdraw/
@api_view(["POST"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def driver_withdraw_money(request):
    """Allow driver to withdraw earnings to bank/UPI."""
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    wallet = DriverWallet.objects.get(driver=dp)
    if wallet.is_frozen:
        return Response(
            {"error": "Wallet is frozen. Cannot withdraw earnings."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    amount = Decimal(str(request.data.get("amount", 0)))
    method = request.data.get("transaction_method", "upi")

    if amount <= 0:
        return Response(
            {"error": "Invalid amount."}, status=status.HTTP_400_BAD_REQUEST
        )

    with transaction.atomic():
        wallet = DriverWallet.objects.select_for_update().get(driver=dp)
        if wallet.balance < amount:
            return Response(
                {"error": "Insufficient balance."}, status=status.HTTP_400_BAD_REQUEST
            )

        wallet.balance -= amount
        wallet.save()

        DriverTransaction.objects.create(
            wallet=wallet,
            txn_type="debit",
            amount=amount,
            description=f"Withdrawal via {method.upper()}",
        )

    create_driver_notification(
        driver=dp,
        title="Withdrawal Successful! 🏦",
        message=f"₹{amount} withdrawal initiated. Funds will arrive in your account shortly.",
        notif_type="payment",
    )

    return Response(
        {
            "message": f"Successfully withdrawn ₹{amount}",
            "balance": float(wallet.balance),
        }
    )


@api_view(["POST"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def driver_set_pin(request):
    """Set or update driver's transaction PIN."""
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    pin = request.data.get("pin")
    if not pin or len(pin) != 4 or not pin.isdigit():
        return Response(
            {"error": "Standard 4-digit PIN required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    wallet, _ = DriverWallet.objects.get_or_create(driver=dp)
    wallet.pin = make_password(pin)
    wallet.save()

    return Response({"message": "Transaction PIN set successfully."})


@api_view(["POST"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def driver_verify_pin(request):
    """Verify driver's transaction PIN."""
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    pin = request.data.get("pin")
    wallet, _ = DriverWallet.objects.get_or_create(driver=dp)

    if not wallet.pin:
        return Response(
            {"error": "No PIN set."}, status=status.HTTP_400_BAD_REQUEST
        )

    if check_password(pin, wallet.pin):
        return Response({"message": "PIN verified successfully."})
    else:
        return Response({"error": "Incorrect PIN."}, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def driver_toggle_freeze(request):
    """Toggle driver wallet freeze status."""
    dp = require_driver(request)
    if not dp:
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    wallet, _ = DriverWallet.objects.get_or_create(driver=dp)
    wallet.is_frozen = not wallet.is_frozen
    wallet.save()

    status_str = "Frozen" if wallet.is_frozen else "Active"
    return Response(
        {"message": f"Wallet is now {status_str}.", "is_frozen": wallet.is_frozen}
    )


@api_view(["POST"])
@authentication_classes([DriverTokenAuthentication])
@permission_classes([AllowAny])
def driver_logout(request):
    """Set driver offline and blacklist token."""
    dp = require_driver(request)
    if dp:
        dp.is_online = False
        dp.save(update_fields=["is_online"])

        # Blacklist token if utility exists
        from .authentication import add_driver_token_to_blacklist

        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            add_driver_token_to_blacklist(token)

    return Response({"message": "Logout successful."})
