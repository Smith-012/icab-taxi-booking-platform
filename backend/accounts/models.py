from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
)
from django.db import models
from django.core.exceptions import ValidationError
import re


class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user


class CustomUser(AbstractBaseUser):
    ROLE_CHOICES = [
        ("user", "Rider"),
        ("driver", "Driver"),
        ("admin", "Admin"),
    ]
    STATUS_CHOICES = [
        ("active", "Active"),
        ("suspended", "Suspended"),
        ("deleted", "Deleted"),
    ]

    email = models.EmailField(unique=True)
    name = models.CharField(max_length=150)
    first_name = models.CharField(max_length=10, blank=True)
    last_name = models.CharField(max_length=10, blank=True)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default="user")
    phone = models.CharField(max_length=20, blank=True)
    gender = models.CharField(max_length=10, blank=True)
    home_address = models.TextField(blank=True)  # Home address
    work_address = models.TextField(blank=True)  # Work address
    date_of_birth = models.DateField(blank=True, null=True)
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="active")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = CustomUserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        db_table = "users"
        verbose_name = "User"
        verbose_name_plural = "Users"

    def clean(self):
        """Validate first_name and last_name"""
        if self.first_name:
            if len(self.first_name) > 10:
                raise ValidationError(
                    {"first_name": "First name must be maximum 10 characters."}
                )
            if not re.match(r"^[a-zA-Z]+$", self.first_name):
                raise ValidationError(
                    {"first_name": "First name can only contain alphabets (A-Z, a-z)."}
                )

        if self.last_name:
            if len(self.last_name) > 10:
                raise ValidationError(
                    {"last_name": "Last name must be maximum 10 characters."}
                )
            if not re.match(r"^[a-zA-Z]+$", self.last_name):
                raise ValidationError(
                    {"last_name": "Last name can only contain alphabets (A-Z, a-z)."}
                )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def get_profile_completion_percentage(self):
        """
        Calculate profile completion percentage (0-100).
        Rider: first_name, last_name, phone, gender, address, work_address, date_of_birth, avatar, emergency_contact
        Driver adds: license_no, vehicle_model, vehicle_plate
        """
        required_fields = [
            self.first_name,
            self.last_name,
            self.phone,
            self.gender,
            self.home_address,
            self.work_address,
            self.date_of_birth,
            self.avatar,
            self.emergency_contacts.exists(),
        ]

        if self.role == "driver":
            try:
                # Add driver-only required fields
                required_fields.extend(
                    [self.license_no, self.vehicle_model, self.vehicle_plate]
                )
            except Exception:
                pass

        # Count non-empty fields
        filled_fields = 0
        for field in required_fields:
            if field:
                filled_fields += 1

        total_fields = len(required_fields)
        percentage = (filled_fields * 100) // total_fields if total_fields > 0 else 0
        return min(100, max(0, percentage))

    def __str__(self):
        return f"{self.name} ({self.email}) — {self.role}"


class Admin(models.Model):
    """
    Dedicated Admin model for system administrators.
    Separate from CustomUser for cleaner admin authentication.
    """

    STATUS_CHOICES = [
        ("active", "Active"),
        ("inactive", "Inactive"),
    ]

    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=150)
    password = models.CharField(max_length=255)  # Hashed password
    loginid = models.EmailField(unique=True)
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True, null=True)
    role = models.CharField(max_length=50, default="admin")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "admin"
        verbose_name = "Admin"
        verbose_name_plural = "Admins"

    def __str__(self):
        return f"{self.name} ({self.loginid})"


class PastUser(models.Model):
    """
    Archive table for deleted users. Stores a JSON snapshot plus key searchable fields.
    Database table name: 'past_user'.
    """

    original_id = models.IntegerField(null=True, blank=True)
    email = models.EmailField()
    name = models.CharField(max_length=150, blank=True)
    role = models.CharField(max_length=10, blank=True)

    # Explicit user fields copied from `users` table
    last_login = models.DateTimeField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    gender = models.CharField(max_length=10, blank=True, null=True)
    home_address = models.TextField(blank=True, null=True)
    work_address = models.TextField(blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    avatar = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    first_name = models.CharField(max_length=10, blank=True, null=True)
    last_name = models.CharField(max_length=10, blank=True, null=True)

    # Keep JSON snapshot for compatibility/backups
    data = models.TextField(blank=True, null=True)
    deleted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "past_user"
        verbose_name = "Archived User"
        verbose_name_plural = "Archived Users"

    def __str__(self):
        return f"Archived: {self.email} (orig_id={self.original_id})"


class PastEmergencyContact(models.Model):
    """Archived emergency contacts linked to a `PastUser` snapshot."""

    past_user = models.ForeignKey(
        PastUser, on_delete=models.CASCADE, related_name="emergency_contacts"
    )
    original_id = models.IntegerField(null=True, blank=True)
    name = models.CharField(max_length=25)
    phone = models.CharField(max_length=13)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "past_emergency_contacts"
        verbose_name = "Archived Emergency Contact"
        verbose_name_plural = "Archived Emergency Contacts"

    def __str__(self):
        return f"Archived Contact: {self.name} ({self.phone}) -> past_user={self.past_user_id}"


class EmergencyContact(models.Model):
    """Store up to 3 emergency contacts per user"""

    user = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="emergency_contacts"
    )
    name = models.CharField(max_length=25)  # Max 25 characters - only letters
    phone = models.CharField(max_length=13)  # +91 + 10 digits
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "emergency_contacts"
        verbose_name = "Emergency Contact"
        verbose_name_plural = "Emergency Contacts"
        ordering = ["created_at"]

    def clean(self):
        """Validate name and phone"""
        # Validate name: only uppercase and lowercase letters, max 25 chars
        if self.name:
            if len(self.name) > 25:
                raise ValidationError({"name": "Name must be maximum 25 characters."})
            if not re.match(r"^[a-zA-Z\s]+$", self.name):
                raise ValidationError(
                    {"name": "Name can only contain letters and spaces."}
                )

        # Validate phone: must be 10 digits (with or without +91 prefix)
        if self.phone:
            # Remove +91 prefix if present for validation
            phone_digits = self.phone.replace("+91", "").strip()
            if not re.match(r"^\d{10}$", phone_digits):
                raise ValidationError(
                    {"phone": "Phone number must be exactly 10 digits."}
                )
            # Ensure +91 prefix is present for storage
            if not self.phone.startswith("+91"):
                self.phone = "+91" + phone_digits

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.phone}) — {self.user.name}"
