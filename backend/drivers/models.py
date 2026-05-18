from django.db import models, transaction
from django.contrib.auth.hashers import make_password
import re


class DriverProfile(models.Model):
    """
    Standalone driver table - completely independent from users table.
    Drivers store ALL their data here: authentication, profile, and vehicle info.
    """

    ROLE_CHOICES = [("driver", "Driver")]
    STATUS_CHOICES = [
        ("active", "Active"),
        ("suspended", "Suspended"),
        ("deleted", "Deleted"),
    ]

    # Authentication & Identity Fields (from users table)
    password = models.CharField(max_length=128, blank=True)
    last_login = models.DateTimeField(blank=True, null=True)
    email = models.EmailField(unique=True, blank=True, null=True)
    name = models.CharField(max_length=150, blank=True, null=True)
    first_name = models.CharField(max_length=10, blank=True)
    last_name = models.CharField(max_length=10, blank=True)

    # Profile Fields
    phone = models.CharField(max_length=20, blank=True)
    gender = models.CharField(max_length=10, blank=True)
    date_of_birth = models.DateField(blank=True, null=True)
    avatar = models.ImageField(upload_to="driver_avatars/", blank=True, null=True)

    # Status Fields
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default="driver")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="active")
    is_active = models.BooleanField(default=True)

    # Driver-Specific Fields
    VEHICLE_TYPE_CHOICES = [
        ("hatchback", "Hatchback"),
        ("sedan", "Sedan"),
        ("suv", "SUV"),
        ("suv-muv", "SUV/MUV"),
        ("muv", "MUV"),
    ]
    vehicle_type = models.CharField(
        max_length=10, choices=VEHICLE_TYPE_CHOICES, default="sedan", blank=True
    )
    vehicle_model = models.CharField(max_length=100, blank=True)  # e.g., "Maruti Swift"
    vehicle_plate = models.CharField(
        max_length=10, unique=True, blank=True
    )  # e.g., "GJ04BQ3010"
    license_no = models.CharField(
        max_length=15, unique=True, blank=True
    )  # Driving license number

    # Performance & Rating Fields
    rating = models.FloatField(default=0.0)
    total_rides = models.IntegerField(default=0)
    total_earnings = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    is_online = models.BooleanField(default=False)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    def add_earnings(self, amount, ride=None, description=None):
        """Helper to increment earnings and create a transaction record in one go."""
        from decimal import Decimal
        from django.db import transaction
        
        amt = Decimal(str(amount))

        with transaction.atomic():
            # 1. Update Profile Earnings (Atomic Lock)
            locked_profile = DriverProfile.objects.select_for_update().get(pk=self.pk)
            locked_profile.total_earnings += amt
            locked_profile.save(update_fields=["total_earnings"])

            # 2. Update Wallet Balance (Atomic Lock)
            from wallet.models import DriverWallet, DriverTransaction
            wallet, created = DriverWallet.objects.select_for_update().get_or_create(
                driver=locked_profile
            )
            wallet.balance += amt
            wallet.save(update_fields=["balance"])

            # 3. Create Transaction Record
            DriverTransaction.objects.create(
                wallet=wallet,
                ride=ride,
                txn_type="credit",
                amount=amt,
                description=description or f"Ride earnings: #{ride.id if ride else 'N/A'}"
            )

    def save(self, *args, **kwargs):
        # Sync full name field with first and last name
        if self.first_name or self.last_name:
            self.name = f"{self.first_name} {self.last_name}".strip()
        super().save(*args, **kwargs)

    class Meta:
        db_table = "driver"
        verbose_name = "Driver"
        verbose_name_plural = "Drivers"

    @property
    def profile_completion_percentage(self):
        """Calculates the percentage of profile fields that are filled"""
        # Data fields for a driver profile
        fields = [
            self.first_name,
            self.last_name,
            self.email,
            self.phone,
            self.gender,
            self.date_of_birth,
            self.vehicle_type,
            self.vehicle_model,
            self.vehicle_plate,
            self.license_no,
            self.avatar,
        ]
        filled = sum(1 for f in fields if f)
        return round((filled / len(fields)) * 100)

    def __str__(self):
        return f"{self.name} ({self.email})"

    def set_password(self, raw_password):
        """Hash password using Django's default hasher"""
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        """Check if the provided password matches the stored hash"""
        from django.contrib.auth.hashers import check_password as django_check_password

        return django_check_password(raw_password, self.password)


class PastDriver(models.Model):
    """
    Archive table for deleted drivers.
    Original table name: 'past_driver'.
    """

    original_id = models.IntegerField(null=True, blank=True)
    email = models.EmailField()
    name = models.CharField(max_length=150, blank=True)
    first_name = models.CharField(max_length=10, blank=True)
    last_name = models.CharField(max_length=10, blank=True)

    # Profile snapshot
    last_login = models.DateTimeField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True)
    gender = models.CharField(max_length=10, blank=True)
    date_of_birth = models.DateField(blank=True, null=True)
    avatar = models.CharField(max_length=255, blank=True, null=True)
    role = models.CharField(max_length=10, default="driver")

    # Driver specific snapshot
    vehicle_type = models.CharField(max_length=10, blank=True)
    vehicle_model = models.CharField(max_length=100, blank=True)
    vehicle_plate = models.CharField(max_length=10, blank=True)
    license_no = models.CharField(max_length=15, blank=True)
    total_rides = models.IntegerField(default=0)
    total_earnings = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    rating = models.FloatField(default=0.0)

    # Timestamps
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    deleted_at = models.DateTimeField(auto_now_add=True)
    data = models.TextField(blank=True, null=True)  # JSON snapshot backup

    class Meta:
        db_table = "past_driver"
        verbose_name = "Archived Driver"
        verbose_name_plural = "Archived Drivers"

    def __str__(self):
        return f"Archived: {self.email} (orig_id={self.original_id})"
