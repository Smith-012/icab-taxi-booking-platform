from rest_framework import serializers
from .models import DriverProfile
import re


class DriverProfileSerializer(serializers.ModelSerializer):
    """Serializer for standalone Driver table with all user + driver data"""

    class Meta:
        model = DriverProfile
        fields = [
            "id",
            "name",
            "first_name",
            "last_name",
            "email",
            "phone",
            "gender",
            "date_of_birth",
            "avatar",
            "avatar_url",
            "license_no",
            "vehicle_type",
            "vehicle_model",
            "vehicle_plate",
            "password",
            "is_online",
            "rating",
            "total_rides",
            "total_earnings",
            "status",
            "is_active",
            "role",
            "profile_completion_percentage",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "is_online",
            "rating",
            "total_rides",
            "total_earnings",
            "status",
            "avatar_url",
            "created_at",
            "updated_at",
        ]

    avatar_url = serializers.SerializerMethodField()

    def get_avatar_url(self, obj):
        request = self.context.get("request")
        if obj.avatar and request:
            return request.build_absolute_uri(obj.avatar.url)
        elif obj.avatar:
            # Fallback for when request is not in context
            return obj.avatar.url
        return None

    def validate_vehicle_plate(self, value):
        """
        Validate vehicle plate format: 2 uppercase letters + 2 digits + 2 uppercase letters + 4 digits
        Example: GJ04BQ3010
        Auto-converts lowercase to uppercase.
        """
        if not value:
            return value

        # Auto-convert to uppercase
        value = value.upper().strip()

        # Check if it's exactly 10 characters
        if len(value) != 10:
            raise serializers.ValidationError(
                "Vehicle plate must be exactly 10 characters (e.g., GJ04BQ3010)."
            )

        # Validate pattern: 2 uppercase letters + 2 digits + 2 uppercase letters + 4 digits
        pattern = r"^[A-Z]{2}\d{2}[A-Z]{2}\d{4}$"
        if not re.match(pattern, value):
            raise serializers.ValidationError(
                "Vehicle plate must follow pattern: 2 letters + 2 digits + 2 letters + 4 digits (e.g., GJ04BQ3010)."
            )

        return value

    def validate_license_no(self, value):
        """
        Validate driving license format: 2 uppercase letters + 13 digits
        Example: GJ1234567890123
        """
        if not value:
            return value

        # Auto-convert to uppercase
        value = value.upper().strip()

        # Check if it's exactly 15 characters (2 letters + 13 digits)
        if len(value) != 15:
            raise serializers.ValidationError(
                "Driving license must be exactly 15 characters (2 letters + 13 digits, e.g., GJ1234567890123)."
            )

        # Validate pattern: 2 uppercase letters + 13 digits
        pattern = r"^[A-Z]{2}\d{13}$"
        if not re.match(pattern, value):
            raise serializers.ValidationError(
                "Driving license must follow pattern: 2 letters + 13 digits (e.g., GJ1234567890123)."
            )

        return value

    def create(self, validated_data):
        """Hashing password during driver creation"""
        password = validated_data.pop("password", None)
        instance = super().create(validated_data)
        if password:
            instance.set_password(password)
            instance.save()
        return instance
