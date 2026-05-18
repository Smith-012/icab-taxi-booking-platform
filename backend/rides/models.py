from django.db import models
from django.conf import settings


class Ride(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("accepted", "Accepted"),
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    PAYMENT_CHOICES = [
        ("wallet", "Wallet"),
        ("upi", "UPI"),
        ("cash", "Cash"),
    ]

    PAYMENT_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("paid", "Paid"),
        ("refunded", "Refunded"),
    ]

    # ── Core relationships ──
    rider = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rides_as_rider",
    )
    driver = models.ForeignKey(
        "drivers.DriverProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rides_as_driver",
    )

    # ── Location details ──
    pickup = models.CharField(max_length=255)
    dropoff = models.CharField(max_length=255)
    pickup_lat = models.FloatField(null=True, blank=True)
    pickup_lng = models.FloatField(null=True, blank=True)
    dropoff_lat = models.FloatField(null=True, blank=True)
    dropoff_lng = models.FloatField(null=True, blank=True)

    # ── Ride details ──
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    fare = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    distance = models.FloatField(null=True, blank=True)  # km
    duration = models.IntegerField(null=True, blank=True)  # minutes
    ride_type = models.CharField(max_length=20, default="standard")
    vehicle_type = models.CharField(max_length=20, default="sedan")
    passengers = models.IntegerField(default=1)
    notes = models.TextField(blank=True)
    rating = models.IntegerField(null=True, blank=True)  # 1-5 by rider

    # ── Payment ──
    payment_method = models.CharField(
        max_length=10, choices=PAYMENT_CHOICES, default="wallet"
    )
    payment_status = models.CharField(
        max_length=10, choices=PAYMENT_STATUS_CHOICES, default="pending"
    )

    # ── Cancellation ──
    cancelled_by = models.CharField(max_length=10, blank=True)  # "rider" or "driver"
    cancel_reason = models.TextField(blank=True)
    cancellation_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # ── Round-trip linking ──
    is_return_ride = models.BooleanField(default=False)
    linked_ride = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="linked_return",
    )
    scheduled_at = models.DateTimeField(null=True, blank=True)  # For return rides

    # ── Timestamps ──
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "rides"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Ride #{self.id} — {self.pickup} → {self.dropoff} [{self.status}]"
