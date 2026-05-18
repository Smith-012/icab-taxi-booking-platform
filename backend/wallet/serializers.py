from rest_framework import serializers
from .models import Wallet, Transaction, DriverWallet, DriverTransaction


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = ["id", "txn_type", "amount", "description", "created_at"]
        read_only_fields = ["id", "created_at"]


class WalletSerializer(serializers.ModelSerializer):
    transactions = TransactionSerializer(many=True, read_only=True)
    has_pin = serializers.SerializerMethodField()

    class Meta:
        model = Wallet
        fields = ["balance", "is_frozen", "has_pin", "transactions"]
        read_only_fields = ["balance", "has_pin", "transactions"]

    def get_has_pin(self, obj):
        return bool(obj.pin)


class AddMoneySerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=1.0)
    transaction_method = serializers.CharField(
        max_length=50, required=False, default="card"
    )


class WithdrawSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=1.0)
    transaction_method = serializers.CharField(
        max_length=50, required=False, default="upi"
    )


class SetPinSerializer(serializers.Serializer):
    pin = serializers.CharField(max_length=4, min_length=4)


# ── Driver Wallet Serializers ──────────────────────────────


class DriverTransactionSerializer(serializers.ModelSerializer):
    ride_id = serializers.IntegerField(
        source="ride.id", read_only=True, allow_null=True
    )

    class Meta:
        model = DriverTransaction
        fields = ["id", "ride_id", "txn_type", "amount", "description", "created_at"]
        read_only_fields = ["id", "created_at"]


class DriverWalletSerializer(serializers.ModelSerializer):
    transactions = DriverTransactionSerializer(many=True, read_only=True)
    has_pin = serializers.SerializerMethodField()

    class Meta:
        model = DriverWallet
        fields = ["balance", "is_frozen", "has_pin", "transactions"]
        read_only_fields = ["balance", "has_pin", "transactions"]

    def get_has_pin(self, obj):
        return bool(obj.pin)
