from rest_framework import serializers
from .models import Ride
from accounts.serializers import UserSerializer


class RideSerializer(serializers.ModelSerializer):
    rider_name = serializers.CharField(source="rider.name", read_only=True)
    driver_name = serializers.CharField(
        source="driver.name", read_only=True, allow_null=True
    )
    driver_vehicle = serializers.CharField(
        source="driver.vehicle_model", read_only=True, allow_null=True
    )
    driver_plate = serializers.CharField(
        source="driver.vehicle_plate", read_only=True, allow_null=True
    )
    driver_phone = serializers.CharField(
        source="driver.phone", read_only=True, allow_null=True
    )
    # For UPI payment modal — generate dummy UPI ID from driver name
    driver_upi_id = serializers.SerializerMethodField()

    class Meta:
        model = Ride
        fields = [
            "id",
            "rider",
            "rider_name",
            "driver",
            "driver_name",
            "driver_vehicle",
            "driver_plate",
            "driver_phone",
            "driver_upi_id",
            "pickup",
            "dropoff",
            "pickup_lat",
            "pickup_lng",
            "dropoff_lat",
            "dropoff_lng",
            "status",
            "fare",
            "distance",
            "duration",
            "ride_type",
            "vehicle_type",
            "passengers",
            "notes",
            "rating",
            "payment_method",
            "payment_status",
            "cancelled_by",
            "cancellation_fee",
            "is_return_ride",
            "linked_ride",
            "scheduled_at",
            "created_at",
            "accepted_at",
            "started_at",
            "completed_at",
        ]
        read_only_fields = [
            "id",
            "rider",
            "status",
            "driver",
            "created_at",
            "accepted_at",
            "started_at",
            "completed_at",
        ]

    def get_driver_upi_id(self, obj):
        """Generate a dummy UPI ID for UPI payment modal."""
        if obj.driver and obj.driver.name:
            safe_name = obj.driver.name.lower().replace(" ", "_")
            return f"{safe_name}@icab"
        return None


class BookRideSerializer(serializers.Serializer):
    pickup = serializers.CharField()
    dropoff = serializers.CharField()
    pickup_lat = serializers.FloatField(required=False, allow_null=True)
    pickup_lng = serializers.FloatField(required=False, allow_null=True)
    dropoff_lat = serializers.FloatField(required=False, allow_null=True)
    dropoff_lng = serializers.FloatField(required=False, allow_null=True)
    ride_type = serializers.ChoiceField(choices=["standard"], default="standard")
    vehicle_type = serializers.ChoiceField(
        choices=["hatchback", "sedan", "suv", "suv-muv", "muv"], default="sedan"
    )
    passengers = serializers.IntegerField(default=1, min_value=1, max_value=7)
    payment_method = serializers.ChoiceField(
        choices=["wallet", "upi", "cash"], default="wallet"
    )
    trip_type = serializers.ChoiceField(
        choices=["one-way", "round-trip"], default="one-way"
    )
    return_time = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    pin = serializers.CharField(required=False, write_only=True)


class FareEstimateSerializer(serializers.Serializer):
    pickup_lat = serializers.FloatField(required=False)
    pickup_lng = serializers.FloatField(required=False)
    dropoff_lat = serializers.FloatField(required=False)
    dropoff_lng = serializers.FloatField(required=False)
    distance = serializers.FloatField(required=False)
    ride_type = serializers.ChoiceField(choices=["standard"], default="standard")
    vehicle_type = serializers.ChoiceField(
        choices=["hatchback", "sedan", "suv", "suv-muv", "muv"],
        default="sedan",
        required=False,
    )


class RateRideSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
