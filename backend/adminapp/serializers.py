from rest_framework import serializers
from accounts.models import CustomUser, PastUser
from rides.models import Ride
from drivers.models import DriverProfile, PastDriver


class AdminUserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = [
            "id",
            "email",
            "name",
            "first_name",
            "last_name",
            "role",
            "phone",
            "gender",
            "home_address",
            "work_address",
            "date_of_birth",
            "avatar",
            "avatar_url",
            "status",
            "is_active",
            "created_at",
            "updated_at",
            "last_login",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_avatar_url(self, obj):
        request = self.context.get("request")
        if obj.avatar and request:
            return request.build_absolute_uri(obj.avatar.url)
        return None


class AdminRideSerializer(serializers.ModelSerializer):
    rider_name = serializers.CharField(source="rider.name", read_only=True)
    driver_name = serializers.CharField(
        source="driver.name", read_only=True, allow_null=True
    )

    class Meta:
        model = Ride
        fields = [
            "id",
            "rider_name",
            "driver_name",
            "pickup",
            "dropoff",
            "status",
            "fare",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class AdminDriverSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = DriverProfile
        fields = [
            "id",
            "avatar_url",
            "email",
            "name",
            "first_name",
            "last_name",
            "phone",
            "gender",
            "date_of_birth",
            "vehicle_model",
            "vehicle_plate",
            "license_no",
            "rating",
            "total_rides",
            "total_earnings",
            "role",
            "status",
            "created_at",
            "updated_at",
            "last_login",
        ]
        read_only_fields = fields

    def get_avatar_url(self, obj):
        request = self.context.get("request")
        if obj.avatar and request:
            return request.build_absolute_uri(obj.avatar.url)
        return None


class AdminStatsSerializer(serializers.Serializer):
    total_users = serializers.IntegerField()
    total_drivers = serializers.IntegerField()
    total_riders = serializers.IntegerField()
    total_rides = serializers.IntegerField()
    completed_rides = serializers.IntegerField()
    cancelled_rides = serializers.IntegerField()
    total_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    avg_rating = serializers.FloatField()


class AdminPastUserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = PastUser
        fields = [
            "id",
            "original_id",
            "first_name",
            "last_name",
            "email",
            "name",
            "role",
            "phone",
            "gender",
            "date_of_birth",
            "home_address",
            "work_address",
            "avatar",
            "avatar_url",
            "deleted_at",
            "created_at",
            "updated_at",
            "last_login",
        ]
        read_only_fields = fields

    def get_avatar_url(self, obj):
        request = self.context.get("request")
        if obj.avatar and request:
            # Build absolute URI for absolute path consistency
            return request.build_absolute_uri(f"/media/{obj.avatar}")
        return None


class AdminPastDriverSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = PastDriver
        fields = [
            "id",
            "original_id",
            "first_name",
            "last_name",
            "email",
            "name",
            "phone",
            "gender",
            "date_of_birth",
            "avatar",
            "avatar_url",
            "role",
            "vehicle_model",
            "vehicle_plate",
            "license_no",
            "total_rides",
            "total_earnings",
            "rating",
            "created_at",
            "updated_at",
            "deleted_at",
        ]
        read_only_fields = fields

    def get_avatar_url(self, obj):
        request = self.context.get("request")
        if obj.avatar and request:
            return request.build_absolute_uri(f"/media/{obj.avatar}")
        return None
