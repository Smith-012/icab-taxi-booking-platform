import math
import hashlib
from decimal import Decimal
from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from django.conf import settings
from django.contrib.auth.hashers import check_password
from .models import Ride
from .serializers import (
    RideSerializer,
    BookRideSerializer,
    FareEstimateSerializer,
    RateRideSerializer,
)
from notifications.utils import create_notification, create_driver_notification
from wallet.models import Transaction, DriverTransaction


# ── Constants ──────────────────────────────────────────────
CANCELLATION_PENALTY = Decimal("25.00")  # ₹25 flat

# Fare calculation tables (no commission — 100% goes to driver)
BASE_FARES = {
    "hatchback": {"standard": 20},
    "sedan": {"standard": 25},
    "suv": {"standard": 35},
    "suv-muv": {"standard": 45},
    "muv": {"standard": 40},
}
PER_KM_RATES = {
    "hatchback": {"standard": 8},
    "sedan": {"standard": 10},
    "suv": {"standard": 14},
    "suv-muv": {"standard": 18},
    "muv": {"standard": 16},
}


def get_traffic_multiplier(time_obj=None):
    """Returns a multiplier based on current time or provided time_obj."""
    try:
        from django.utils import timezone

        if time_obj:
            if isinstance(time_obj, str):
                from django.utils.dateparse import parse_datetime

                now = parse_datetime(time_obj)
            else:
                now = time_obj
        else:
            now = timezone.now()

        # Use project timezone (Asia/Kolkata)
        now = now.astimezone(timezone.get_default_timezone())
        hour = now.hour
        minute = now.minute
        time_float = hour + (minute / 60)

        # Peak Morning: 08:30 - 10:30 (1.8x)
        if 8.5 <= time_float <= 10.5:
            return 1.8
        # Peak Evening: 17:30 - 20:30 (2.0x)
        if 17.5 <= time_float <= 20.5:
            return 2.0
        # Night: 22:00 - 06:00 (1.0x)
        if time_float >= 22 or time_float <= 6:
            return 1.0
        # Day / Normal: (1.3x)
        return 1.3
    except Exception:
        return 1.3


def calculate_fare(distance_km, ride_type="standard", vehicle_type="sedan"):
    """Calculate fare based on distance, ride type, and vehicle type."""
    base = BASE_FARES.get(vehicle_type, {}).get(ride_type, 25)
    per_km = PER_KM_RATES.get(vehicle_type, {}).get(ride_type, 10)

    # Optional: Apply subtle traffic surcharge during peak hours
    multiplier = get_traffic_multiplier()
    surcharge = 1.0
    if multiplier >= 1.8:
        surcharge = 1.0  # Peak surcharge disabled (set to 1x)

    return round((base + (distance_km * per_km)) * surcharge, 2)


def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance in km between two coordinates."""
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── POST /api/rides/estimate/ ──────────────────────────────
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def fare_estimate(request):
    serializer = FareEstimateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data
    distance = data.get("distance")
    vehicle_type = data.get("vehicle_type", "sedan")

    if not distance:
        if all(
            k in data
            for k in ["pickup_lat", "pickup_lng", "dropoff_lat", "dropoff_lng"]
        ):
            distance = haversine_distance(
                data["pickup_lat"],
                data["pickup_lng"],
                data["dropoff_lat"],
                data["dropoff_lng"],
            )
        else:
            distance = 5.0  # default estimate

    multiplier = get_traffic_multiplier()
    fare = calculate_fare(distance, data.get("ride_type", "standard"), vehicle_type)
    duration = int(distance * 3 * multiplier)  # 3 min/km * traffic factor

    return Response(
        {
            "distance": round(distance, 2),
            "duration": duration,
            "fare": fare,
            "ride_type": data.get("ride_type", "standard"),
            "vehicle_type": vehicle_type,
        }
    )


# ── POST /api/rides/book/ ─────────────────────────────────
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def book_ride(request):
    if request.user.role != "user":
        return Response(
            {"error": "Only riders can book rides."}, status=status.HTTP_403_FORBIDDEN
        )

    # ── Global Balance Check ──
    wallet = request.user.wallet
    if wallet.balance < 0:
        return Response(
            {"error": "Please adjust wallet balance before booking ride."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = BookRideSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data
    vehicle_type = data.get("vehicle_type", "sedan")
    ride_type = data.get("ride_type", "standard")
    payment_method = data.get("payment_method", "wallet")
    trip_type = data.get("trip_type", "one-way")
    return_time = data.get("return_time")

    # Calculate distance & fare
    distance = 5.0
    if data.get("pickup_lat") and data.get("dropoff_lat"):
        distance = haversine_distance(
            data["pickup_lat"],
            data["pickup_lng"],
            data["dropoff_lat"],
            data["dropoff_lng"],
        )

    multiplier = get_traffic_multiplier()
    # For return leg, calculate multiplier based on scheduled return time
    return_multiplier = (
        get_traffic_multiplier(return_time) if trip_type == "round-trip" else multiplier
    )

    fare = calculate_fare(distance, ride_type, vehicle_type)
    duration = int(distance * 3 * multiplier)

    # Base fare calculation (approximate base before peak)
    # This ensures that if outbound is peak and return is not, price is fair.
    base_calc = fare / 1.15 if multiplier >= 1.8 else fare
    return_fare = base_calc * 1.15 if return_multiplier >= 1.8 else base_calc

    total_fare = fare + return_fare if trip_type == "round-trip" else fare

    # ── Wallet balance check & Deduction (Locked) ──
    if payment_method == "wallet":
        try:
            from wallet.models import Wallet

            # Lock the wallet row to prevent race conditions
            wallet = Wallet.objects.select_for_update().get(user=request.user)

            # ── PIN Verification & Lockout ──
            if not wallet.pin:
                return Response(
                    {
                        "error": "Transaction PIN not set. Please set a PIN in your wallet profile before booking with wallet."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            from django.utils import timezone

            if wallet.pin_locked_until and wallet.pin_locked_until > timezone.now():
                return Response(
                    {
                        "error": f"Wallet locked. Try again after {wallet.pin_locked_until.strftime('%H:%M:%S')}."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            sent_pin = data.get("pin")

            if not sent_pin or not check_password(sent_pin, wallet.pin):
                wallet.failed_pin_attempts += 1
                if wallet.failed_pin_attempts >= 5:
                    wallet.pin_locked_until = timezone.now() + timezone.timedelta(
                        minutes=10
                    )
                    wallet.failed_pin_attempts = 0  # reset after locking
                wallet.save()
                return Response(
                    {"error": "Incorrect Transaction PIN."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            # Reset attempts on success
            wallet.failed_pin_attempts = 0
            wallet.pin_locked_until = None

            if wallet.balance < Decimal(str(total_fare)):
                wallet.save()  # save reset attempts
                return Response(
                    {
                        "error": f"Insufficient wallet balance. Need ₹{total_fare}, have ₹{wallet.balance}."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Deduct immediately to reserve funds
            wallet.balance -= Decimal(str(total_fare))
            wallet.save()

            # Create transaction record
            from wallet.models import Transaction

            Transaction.objects.create(
                wallet=wallet,
                txn_type="debit",
                amount=Decimal(str(total_fare)),
                description=f"Payment for Ride {'(Round-trip)' if trip_type == 'round-trip' else ''}",
            )
        except Wallet.DoesNotExist:
            return Response(
                {"error": "Wallet not found. Please set up your wallet first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # ── Create outbound ride ──
    outbound_ride = Ride.objects.create(
        rider=request.user,
        pickup=data["pickup"],
        dropoff=data["dropoff"],
        pickup_lat=data.get("pickup_lat"),
        pickup_lng=data.get("pickup_lng"),
        dropoff_lat=data.get("dropoff_lat"),
        dropoff_lng=data.get("dropoff_lng"),
        ride_type=ride_type,
        vehicle_type=vehicle_type,
        passengers=data.get("passengers", 1),
        payment_method=payment_method,
        notes=data.get("notes", ""),
        fare=fare,
        distance=round(distance, 2),
        duration=duration,
        status="pending",
        payment_status="paid" if payment_method == "wallet" else "unpaid",
    )

    create_notification(
        user=request.user,
        title="Ride Booked! 🚕",
        message=f"Your ride from {outbound_ride.pickup} to {outbound_ride.dropoff} has been booked. Fare: ₹{fare}. Searching for a driver...",
        notif_type="ride",
    )

    response_data = {
        "message": "Ride booked successfully.",
        "ride": RideSerializer(outbound_ride).data,
    }

    # ── Create return ride if round-trip ──
    if trip_type == "round-trip" and return_time:
        return_ride = Ride.objects.create(
            rider=request.user,
            pickup=data["dropoff"],  # Swapped
            dropoff=data["pickup"],  # Swapped
            pickup_lat=data.get("dropoff_lat"),
            pickup_lng=data.get("dropoff_lng"),
            dropoff_lat=data.get("pickup_lat"),
            dropoff_lng=data.get("pickup_lng"),
            ride_type=ride_type,
            vehicle_type=vehicle_type,
            passengers=data.get("passengers", 1),
            payment_method=payment_method,
            notes=data.get("notes", ""),
            fare=fare,
            distance=round(distance, 2),
            duration=duration,
            status="pending",
            is_return_ride=True,
            linked_ride=outbound_ride,
            scheduled_at=return_time,
            payment_status="paid" if payment_method == "wallet" else "unpaid",
        )

        # Link outbound to return
        outbound_ride.linked_ride = return_ride
        outbound_ride.save(update_fields=["linked_ride"])

        create_notification(
            user=request.user,
            title="Return Ride Scheduled! 🔄",
            message=f"Your return ride from {return_ride.pickup} to {return_ride.dropoff} is scheduled.",
            notif_type="ride",
        )

        response_data["return_ride"] = RideSerializer(return_ride).data
        response_data["message"] = "Round-trip booked successfully."

    return Response(response_data, status=status.HTTP_201_CREATED)


# ── GET /api/rides/ ────────────────────────────────────────
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ride_list(request):
    user = request.user

    from drivers.authentication import DriverUser

    if user.role == "admin":
        rides = Ride.objects.all()
    elif isinstance(user, DriverUser) or user.role == "driver":
        driver_id = user.id if isinstance(user, DriverUser) else None
        if not driver_id:
            try:
                from drivers.models import DriverProfile

                dp = DriverProfile.objects.get(user=user)
                driver_id = dp.id
            except Exception:
                return Response([])
        rides = Ride.objects.filter(driver_id=driver_id)
    else:
        rides = Ride.objects.filter(rider=user)

    # Filters
    status_filter = request.query_params.get("status")
    if status_filter:
        rides = rides.filter(status=status_filter)

    serializer = RideSerializer(rides, many=True)
    return Response(serializer.data)


# ── GET /api/rides/{id}/ ───────────────────────────────────
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ride_detail(request, pk):
    try:
        ride = Ride.objects.get(pk=pk)
    except Ride.DoesNotExist:
        return Response({"error": "Ride not found."}, status=status.HTTP_404_NOT_FOUND)

    # Permissions check
    from drivers.authentication import DriverUser

    is_driver_of_ride = False
    if isinstance(request.user, DriverUser):
        is_driver_of_ride = ride.driver_id == request.user.id
    else:
        # Standard Ride user - check if they are the rider
        # Riders can't be drivers of a ride in this standalone-profile system
        pass

    if (
        request.user.role not in ["admin"]
        and ride.rider != request.user
        and not is_driver_of_ride
    ):
        return Response({"error": "Not authorized."}, status=status.HTTP_403_FORBIDDEN)

    return Response(RideSerializer(ride).data)


# ── POST /api/rides/{id}/cancel/ ───────────────────────────
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_ride(request, pk):
    """Rider cancels a ride. Penalty applies if driver already accepted."""
    try:
        ride = Ride.objects.get(pk=pk, rider=request.user)
    except Ride.DoesNotExist:
        return Response({"error": "Ride not found."}, status=status.HTTP_404_NOT_FOUND)

    if ride.status not in ["pending", "accepted"]:
        msg = "Cannot cancel this ride."
        if ride.status == "in_progress":
            msg = "Ride already in progress. Only the driver can cancel now for safety reasons."
        return Response(
            {"error": msg},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ride.cancelled_by = "rider"
    ride.cancel_reason = request.data.get("reason", "")
    # ── Refund / Penalty Logic ──
    with transaction.atomic():
        # Re-fetch wallet with lock
        from wallet.models import Wallet, Transaction

        try:
            wallet = Wallet.objects.select_for_update().get(user=request.user)

            # If rider cancels AFTER driver accepted -> apply penalty
            if ride.status == "accepted" and ride.driver:
                penalty = CANCELLATION_PENALTY

                # If payment was NOT wallet, we deduct penalty from balance
                if ride.payment_method != "wallet":
                    wallet.balance -= penalty
                    wallet.save()
                    Transaction.objects.create(
                        wallet=wallet,
                        txn_type="debit",
                        amount=penalty,
                        description=f"Cancellation fee for Ride #{ride.id}",
                    )

                ride.cancellation_fee = penalty

                # Notify driver
                create_driver_notification(
                    driver=ride.driver,
                    title="Ride Cancelled by Rider 😔",
                    message=f"Ride #{ride.id} was cancelled by the rider.",
                    notif_type="ride",
                )
                ride.driver = None

            # ── REFUND for Wallet payments ──
            if ride.payment_method == "wallet":
                # If penalty applied, refund is (Fare - Penalty)
                # If no penalty, refund is full Fare
                refund_amount = ride.fare - penalty
                if refund_amount > 0:
                    wallet.balance += refund_amount
                    wallet.save()
                    Transaction.objects.create(
                        wallet=wallet,
                        txn_type="credit",
                        amount=refund_amount,
                        description=f"Refund for Ride #{ride.id} (Fare minus ₹{penalty} penalty)",
                    )
        except Wallet.DoesNotExist:
            pass

        ride.status = "cancelled"
        ride.save()

    # Notify the rider
    penalty_msg = f" Cancellation fee: ₹{penalty}." if penalty > 0 else ""
    create_notification(
        user=request.user,
        title="Ride Cancelled",
        message=f"Your ride #{ride.id} has been cancelled.{penalty_msg}",
        notif_type="ride",
    )

    return Response(
        {
            "message": "Ride cancelled.",
            "ride": RideSerializer(ride).data,
            "penalty": float(penalty),
        }
    )


# ── POST /api/rides/{id}/rate/ ─────────────────────────────
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def rate_ride(request, pk):
    try:
        ride = Ride.objects.get(pk=pk, rider=request.user, status="completed")
    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found or not completed."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if ride.rating is not None:
        return Response(
            {"error": "You have already rated this ride."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = RateRideSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    ride.rating = serializer.validated_data["rating"]
    ride.save()

    # Update driver average rating (fixed aggregation)
    if ride.driver:
        from django.db.models import Avg

        dp = ride.driver
        avg = (
            Ride.objects.filter(driver=dp, status="completed")
            .exclude(rating=None)
            .aggregate(avg=Avg("rating"))["avg"]
        )
        dp.rating = round(avg or 0, 1)
        dp.save(update_fields=["rating"])

        # Notify driver about the rating
        create_driver_notification(
            driver=dp,
            title=f"You received a {ride.rating}★ rating!",
            message=f"A rider rated your Ride #{ride.id} with {ride.rating} stars.",
            notif_type="system",
        )

    return Response({"message": "Rating submitted.", "rating": ride.rating})


# ── POST /api/rides/{id}/pay/wallet/ ───────────────────────
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pay_with_wallet(request, pk):
    """Rider pays for a completed ride using wallet PIN."""
    try:
        ride = Ride.objects.get(
            pk=pk, rider=request.user, status="completed", payment_method="wallet"
        )
    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found or not eligible for wallet payment."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if ride.payment_status == "paid":
        return Response(
            {"error": "Ride is already paid."}, status=status.HTTP_400_BAD_REQUEST
        )

    pin = request.data.get("pin", "")
    wallet = request.user.wallet

    # Verify PIN
    if not wallet.pin:
        return Response(
            {"error": "No wallet PIN set. Please set your PIN first."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not check_password(pin, wallet.pin):
        return Response(
            {"error": "Incorrect wallet PIN."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Check balance
    fare = ride.fare
    if wallet.balance < fare:
        return Response(
            {"error": f"Insufficient balance. Need ₹{fare}, have ₹{wallet.balance}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Debit rider
    wallet.balance -= fare
    wallet.save()
    Transaction.objects.create(
        wallet=wallet,
        txn_type="debit",
        amount=fare,
        description=f"Ride #{ride.id} fare payment",
    )

    # Credit driver (100% — no commission)
    if ride.driver:
        ride.driver.add_earnings(
            fare, ride=ride, description=f"Ride #{ride.id} fare payment via Wallet"
        )

    ride.payment_status = "paid"
    ride.save(update_fields=["payment_status"])

    create_notification(
        user=request.user,
        title="Payment Successful! 💳",
        message=f"₹{fare} deducted from wallet for Ride #{ride.id}.",
        notif_type="payment",
    )

    if ride.driver:
        create_driver_notification(
            driver=ride.driver,
            title="Payment Received! 💰",
            message=f"₹{fare} credited to your wallet for Ride #{ride.id}.",
            notif_type="payment",
        )

    return Response(
        {
            "message": "Payment successful!",
            "balance": float(wallet.balance),
            "ride": RideSerializer(ride).data,
        }
    )


# ── POST /api/rides/{id}/pay/upi/ ─────────────────────────
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pay_with_upi(request, pk):
    """Rider pays for a completed ride using UPI (dummy simulation)."""
    try:
        ride = Ride.objects.get(
            pk=pk, rider=request.user, status="completed", payment_method="upi"
        )
    except Ride.DoesNotExist:
        return Response(
            {"error": "Ride not found or not eligible for UPI payment."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if ride.payment_status == "paid":
        return Response(
            {"error": "Ride is already paid."}, status=status.HTTP_400_BAD_REQUEST
        )

    upi_pin = request.data.get("upi_pin", "")

    # Verify dummy UPI PIN
    if upi_pin != getattr(settings, "SIMULATION_UPI_PIN", "123456"):
        return Response(
            {"error": "Incorrect UPI PIN."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    fare = ride.fare

    # Credit driver (100% — no commission)
    if ride.driver:
        ride.driver.add_earnings(
            fare, ride=ride, description=f"UPI payment for Ride #{ride.id}"
        )

    ride.payment_status = "paid"
    ride.save()

    create_notification(
        user=request.user,
        title="UPI Payment Successful! 💳",
        message=f"₹{fare} paid via UPI for Ride #{ride.id}.",
        notif_type="payment",
    )

    if ride.driver:
        create_driver_notification(
            driver=ride.driver,
            title="UPI Payment Received! 💰",
            message=f"₹{fare} credited to your wallet for Ride #{ride.id}.",
            notif_type="payment",
        )

    return Response(
        {
            "message": "UPI payment successful!",
            "ride": RideSerializer(ride).data,
        }
    )
