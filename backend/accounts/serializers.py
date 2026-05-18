from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import CustomUser, EmergencyContact
import re


class EmergencyContactSerializer(serializers.ModelSerializer):
    """Serializer for emergency contacts"""

    class Meta:
        model = EmergencyContact
        fields = ["id", "name", "phone", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_name(self, value):
        if not value:
            raise serializers.ValidationError("Name is required.")
        if len(value) > 25:
            raise serializers.ValidationError("Name must be maximum 25 characters.")
        if not re.match(r"^[a-zA-Z\s]+$", value):
            raise serializers.ValidationError(
                "Name can only contain letters and spaces."
            )
        return value

    def validate_phone(self, value):
        if not value:
            raise serializers.ValidationError("Phone number is required.")
        # Extract digits only for validation
        digits_only = re.sub(r"\D", "", value)
        if not re.match(r"^\d{10}$", digits_only):
            raise serializers.ValidationError("Phone number must be exactly 10 digits.")
        return digits_only

    def validate(self, data):
        request = self.context.get("request")
        if request and request.user:
            phone = data.get("phone")
            if EmergencyContact.objects.filter(user=request.user, phone=phone).exists():
                raise serializers.ValidationError(
                    {
                        "phone": "This phone number is already in your emergency contacts list."
                    }
                )
        return data


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, max_length=20)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = CustomUser
        fields = [
            "name",
            "email",
            "password",
            "confirm_password",
            "role",
            "phone",
            "first_name",
            "last_name",
        ]
        extra_kwargs = {
            "role": {"default": "user"},
            "first_name": {"required": False},
            "last_name": {"required": False},
        }

    def validate_password(self, value):
        if not re.match(
            r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,20}$", value
        ):
            raise serializers.ValidationError(
                "Password must be 8-20 characters, include an uppercase, a lowercase, a number, and a special character."
            )
        return value

    def validate_phone(self, value):
        if value and not re.match(r"^\d{10}$", value):
            raise serializers.ValidationError("Phone number must be exactly 10 digits.")
        return value

    def validate_email(self, value):
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", value):
            raise serializers.ValidationError("Please enter a valid email address.")
        return value

    def validate_first_name(self, value):
        if value:
            if len(value) > 10:
                raise serializers.ValidationError(
                    "First name must be maximum 10 characters."
                )
            if not re.match(r"^[a-zA-Z]+$", value):
                raise serializers.ValidationError(
                    "First name can only contain alphabets (A-Z, a-z)."
                )
        return value

    def validate_last_name(self, value):
        if value:
            if len(value) > 10:
                raise serializers.ValidationError(
                    "Last name must be maximum 10 characters."
                )
            if not re.match(r"^[a-zA-Z]+$", value):
                raise serializers.ValidationError(
                    "Last name can only contain alphabets (A-Z, a-z)."
                )
        return value

    def validate(self, data):
        if data["password"] != data.pop("confirm_password"):
            raise serializers.ValidationError(
                {"confirm_password": "Passwords do not match."}
            )

        # Split full name into first_name and last_name if not provided
        name = data.get("name", "").strip()
        if name and not data.get("first_name") and not data.get("last_name"):
            parts = name.split(maxsplit=1)
            if len(parts) == 2:
                data["first_name"] = parts[0]
                data["last_name"] = parts[1]
            else:
                data["first_name"] = parts[0]
                data["last_name"] = ""

        # Prevent duplicate email+role combo
        if CustomUser.objects.filter(
            email=data["email"], role=data.get("role", "user")
        ).exists():
            raise serializers.ValidationError(
                {"email": "This email is already registered with this role."}
            )
        return data

    def create(self, validated_data):
        return CustomUser.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, max_length=20)
    role = serializers.ChoiceField(choices=["user", "driver", "admin"], required=False)

    def validate_email(self, value):
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", value):
            raise serializers.ValidationError("Please enter a valid email address.")
        return value


class UserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    profile_completion_percentage = serializers.SerializerMethodField()
    emergency_contacts = EmergencyContactSerializer(many=True, read_only=True)

    class Meta:
        model = CustomUser
        fields = [
            "id",
            "name",
            "first_name",
            "last_name",
            "email",
            "role",
            "phone",
            "gender",
            "home_address",
            "work_address",
            "date_of_birth",
            "emergency_contacts",
            "avatar",
            "avatar_url",
            "profile_completion_percentage",
            "status",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "email",
            "role",
            "status",
            "created_at",
            "avatar_url",
            "profile_completion_percentage",
            "emergency_contacts",
        ]

    def validate_phone(self, value):
        if value and not re.match(r"^\d{10}$", value):
            raise serializers.ValidationError("Phone number must be exactly 10 digits.")
        return value

    def validate_email(self, value):
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", value):
            raise serializers.ValidationError("Please enter a valid email address.")
        return value

    def validate_first_name(self, value):
        if value:
            if len(value) > 10:
                raise serializers.ValidationError(
                    "First name must be maximum 10 characters."
                )
            if not re.match(r"^[a-zA-Z]+$", value):
                raise serializers.ValidationError(
                    "First name can only contain alphabets (A-Z, a-z)."
                )
        return value

    def validate_last_name(self, value):
        if value:
            if len(value) > 10:
                raise serializers.ValidationError(
                    "Last name must be maximum 10 characters."
                )
            if not re.match(r"^[a-zA-Z]+$", value):
                raise serializers.ValidationError(
                    "Last name can only contain alphabets (A-Z, a-z)."
                )
        return value

    def get_avatar_url(self, obj):
        request = self.context.get("request")
        if obj.avatar and request:
            return request.build_absolute_uri(obj.avatar.url)
        return None

    def get_profile_completion_percentage(self, obj):
        """Get profile completion percentage from the model method"""
        return obj.get_profile_completion_percentage()


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8, max_length=20)

    def validate_new_password(self, value):
        if not re.match(
            r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,20}$", value
        ):
            raise serializers.ValidationError(
                "Password must be 8-20 characters, include an uppercase, a lowercase, a number, and a special character."
            )
        return value


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)
    phone = serializers.CharField(required=False)
    new_password = serializers.CharField(write_only=True, min_length=8, max_length=20)
    role = serializers.ChoiceField(
        choices=["user", "driver", "admin"], required=False, default="user"
    )

    def validate_new_password(self, value):
        if not re.match(
            r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,20}$", value
        ):
            raise serializers.ValidationError(
                "Password must be 8-20 characters, include an uppercase, a lowercase, a number, and a special character."
            )
        return value

    def validate(self, data):
        email = data.get("email")
        phone = data.get("phone")

        if not email and not phone:
            raise serializers.ValidationError("Either email or phone is required.")

        if email and not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
            raise serializers.ValidationError(
                {"email": "Please enter a valid email address."}
            )

        if phone and not re.match(r"^\d{10}$", phone):
            raise serializers.ValidationError(
                {"phone": "Phone number must be exactly 10 digits."}
            )

        return data
