from django.db import models
from django.conf import settings
from django.dispatch import receiver
import django.db.models.signals


# ── Rider Wallet ──────────────────────────────────────────


class Wallet(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wallet"
    )
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    is_frozen = models.BooleanField(default=False)
    pin = models.CharField(max_length=255, blank=True)  # hashed PIN
    failed_pin_attempts = models.IntegerField(default=0)
    pin_locked_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "wallets"

    def __str__(self):
        return f"{self.user.name} - ₹{self.balance}"


@receiver(django.db.models.signals.post_save, sender=settings.AUTH_USER_MODEL)
def create_wallet(sender, instance, created, **kwargs):
    if created:
        Wallet.objects.create(user=instance)


class Transaction(models.Model):
    TYPE_CHOICES = [
        ("credit", "Credit"),
        ("debit", "Debit"),
    ]

    wallet = models.ForeignKey(
        Wallet, on_delete=models.CASCADE, related_name="transactions"
    )
    txn_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    transaction_method = models.CharField(max_length=20, default="wallet")
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "transactions"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.wallet.user.name} - {self.txn_type} ₹{self.amount}"


# ── Driver Wallet ─────────────────────────────────────────


class DriverWallet(models.Model):
    """Wallet for drivers to track earnings from rides."""

    driver = models.OneToOneField(
        "drivers.DriverProfile",
        on_delete=models.CASCADE,
        related_name="wallet",
    )
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    is_frozen = models.BooleanField(default=False)
    pin = models.CharField(max_length=255, blank=True)  # hashed PIN
    failed_pin_attempts = models.IntegerField(default=0)
    pin_locked_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "driver_wallets"

    def __str__(self):
        return f"Driver: {self.driver.name} - ₹{self.balance}"


@receiver(
    django.db.models.signals.post_save,
    sender="drivers.DriverProfile",
)
def create_driver_wallet(sender, instance, created, **kwargs):
    """Auto-create a DriverWallet when a new driver registers."""
    if created:
        DriverWallet.objects.get_or_create(driver=instance)


class DriverTransaction(models.Model):
    """Transaction records for driver wallets (earnings, penalties, withdrawals)."""

    TYPE_CHOICES = [
        ("credit", "Credit"),  # Ride earnings
        ("debit", "Debit"),  # Penalty or withdrawal
    ]

    wallet = models.ForeignKey(
        DriverWallet, on_delete=models.CASCADE, related_name="transactions"
    )
    ride = models.ForeignKey(
        "rides.Ride",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    txn_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "driver_transactions"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.wallet.driver.name} - {self.txn_type} ₹{self.amount}"
