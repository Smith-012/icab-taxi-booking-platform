import hashlib
from django.contrib.auth.hashers import make_password, check_password
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Wallet, Transaction
from .serializers import (
    WalletSerializer,
    AddMoneySerializer,
    SetPinSerializer,
    WithdrawSerializer,
)
from notifications.utils import create_notification


# GET /api/wallet/
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def wallet_detail(request):
    wallet = request.user.wallet
    return Response(WalletSerializer(wallet).data)


# POST /api/wallet/add-money/
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def add_money(request):
    wallet = request.user.wallet
    if wallet.is_frozen:
        return Response(
            {"error": "Wallet is frozen. Cannot add funds."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = AddMoneySerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    amount = serializer.validated_data["amount"]
    method = serializer.validated_data.get("transaction_method", "card")

    from django.db import transaction

    with transaction.atomic():
        # Lock the wallet for update
        wallet = Wallet.objects.select_for_update().get(user=request.user)
        wallet.balance += amount
        wallet.save()

    Transaction.objects.create(
        wallet=wallet,
        txn_type="credit",
        amount=amount,
        transaction_method=method,
        description=f"Added funds via {method.upper()}",
    )

    create_notification(
        user=request.user,
        title="Funds Added",
        message=f"₹{amount:.2f} has been credited to your wallet.",
        notif_type="payment",
    )

    return Response(
        {"message": f"Successfully added ₹{amount}", "balance": wallet.balance}
    )


# POST /api/wallet/withdraw/
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def withdraw_money(request):
    wallet = request.user.wallet
    if wallet.is_frozen:
        return Response(
            {"error": "Wallet is frozen. Cannot withdraw funds."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = WithdrawSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    amount = serializer.validated_data["amount"]
    method = serializer.validated_data.get("transaction_method", "upi")

    if wallet.balance < amount:
        return Response(
            {"error": "Insufficient balance for withdrawal."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from django.db import transaction

    with transaction.atomic():
        # Lock for update
        wallet = Wallet.objects.select_for_update().get(user=request.user)
        if wallet.balance < amount:
            return Response(
                {"error": "Insufficient balance."}, status=status.HTTP_400_BAD_REQUEST
            )
        wallet.balance -= amount
        wallet.save()

    Transaction.objects.create(
        wallet=wallet,
        txn_type="debit",
        amount=amount,
        transaction_method=method,
        description=f"Withdrawal via {method.upper()}",
    )

    create_notification(
        user=request.user,
        title="Funds Withdrawn",
        message=f"₹{amount:.2f} has been debited from your wallet.",
        notif_type="payment",
    )

    return Response(
        {"message": f"Successfully withdrawn ₹{amount}", "balance": wallet.balance}
    )


# POST /api/wallet/set-pin/
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def set_pin(request):
    serializer = SetPinSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    wallet = request.user.wallet
    wallet.pin = make_password(serializer.validated_data["pin"])
    wallet.save()

    return Response({"message": "Transaction PIN set successfully."})


# POST /api/wallet/verify-pin/
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_pin(request):
    pin = request.data.get("pin")
    if not pin or len(pin) != 4:
        return Response(
            {"error": "Standard 4-digit PIN required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    wallet = request.user.wallet
    if not wallet.pin:
        return Response(
            {"error": "No PIN set for this wallet."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if check_password(pin, wallet.pin):
        return Response({"message": "PIN verified successfully."})
    else:
        return Response({"error": "Incorrect PIN."}, status=status.HTTP_400_BAD_REQUEST)


# POST /api/wallet/freeze/
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def toggle_freeze(request):
    wallet = request.user.wallet
    wallet.is_frozen = not wallet.is_frozen
    wallet.save()

    status_str = "Frozen" if wallet.is_frozen else "Active"
    return Response(
        {"message": f"Wallet is now {status_str}.", "is_frozen": wallet.is_frozen}
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def transactions_list(request):
    wallet = request.user.wallet
    return Response(
        {
            "transactions": Transaction.objects.filter(wallet=wallet)
            .order_by("-created_at")
            .values("id", "txn_type", "amount", "description", "created_at")
        }
    )
