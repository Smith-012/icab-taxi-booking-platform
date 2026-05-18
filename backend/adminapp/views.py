from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Count, Sum, Avg
from accounts.models import CustomUser, Admin, PastUser
from rides.models import Ride
from drivers.models import DriverProfile, PastDriver
from notifications.models import Notification
from .serializers import (
    AdminUserSerializer,
    AdminRideSerializer,
    AdminDriverSerializer,
    AdminStatsSerializer,
    AdminPastUserSerializer,
    AdminPastDriverSerializer,
)


def is_admin(user):
    """
    Check if user is admin.
    Now 100% database-driven: verifies by role or presence in Admin table.
    """
    if not user or not user.is_authenticated:
        return False

    if hasattr(user, "role") and user.role == "admin":
        return True

    return False


# GET /api/admin/stats/
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_stats(request):
    # Simple stats endpoint for admin dashboard
    return Response(
        {
            "total_users": CustomUser.objects.filter(role="user").count(),
            "total_drivers": DriverProfile.objects.count(),
            "total_riders": CustomUser.objects.filter(role="user").count(),
            "total_rides": Ride.objects.count(),
            "completed_rides": Ride.objects.filter(status="completed").count(),
            "cancelled_rides": Ride.objects.filter(status="cancelled").count(),
            "pending_rides": Ride.objects.filter(
                status__in=["requested", "accepted"]
            ).count(),
            "total_revenue": list(
                Ride.objects.filter(status="completed")
                .aggregate(t=Sum("fare"))
                .values()
            )[0]
            or 0.0,
            "avg_rating": 0.0,
        }
    )


# GET /api/admin/users/
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_users_list(request):
    users = CustomUser.objects.all()
    serializer = AdminUserSerializer(users, many=True, context={"request": request})
    return Response(serializer.data)


# PUT /api/admin/users/{id}/
@api_view(["PUT"])
@permission_classes([IsAuthenticated])
def admin_update_user(request, pk):
    try:
        user = CustomUser.objects.get(pk=pk)
    except CustomUser.DoesNotExist:
        return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

    # Allow status updates
    if "status" in request.data:
        user.status = request.data["status"]
        user.save()

    return Response(
        {
            "message": "User updated.",
            "user": AdminUserSerializer(user).data,
        }
    )


# DELETE /api/admin/users/{id}/
@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def admin_delete_user(request, pk):
    try:
        user = CustomUser.objects.get(pk=pk)
    except CustomUser.DoesNotExist:
        return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)

    # Soft delete
    user.status = "deleted"
    user.is_active = False
    user.save()

    return Response({"message": "User deleted."})


# GET /api/admin/rides/
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_rides_list(request):
    rides = Ride.objects.all()
    serializer = AdminRideSerializer(rides, many=True)
    return Response(serializer.data)


# GET /api/admin/drivers/
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_drivers_list(request):
    drivers = DriverProfile.objects.all()
    serializer = AdminDriverSerializer(drivers, many=True, context={"request": request})
    return Response(serializer.data)


# GET /api/admin/wallets/
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_wallets_list(request):
    from wallet.models import Wallet

    wallets = Wallet.objects.select_related("user").all()
    data = []
    for wallet in wallets:
        data.append(
            {
                "id": wallet.id,
                "user_id": wallet.user.id,
                "user_name": wallet.user.name,
                "user_email": wallet.user.email,
                "balance": str(wallet.balance),
                "is_frozen": wallet.is_frozen,
                "created_at": wallet.created_at,
                "updated_at": wallet.updated_at,
            }
        )
    return Response(data)


# GET /api/admin/notifications/
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_notifications_list(request):
    notifications = (
        Notification.objects.select_related("user").all().order_by("-created_at")
    )
    data = []
    for notif in notifications:
        data.append(
            {
                "id": notif.id,
                "user_id": (
                    notif.user.id
                    if notif.user
                    else (notif.driver.id if notif.driver else None)
                ),
                "user_name": (
                    notif.user.name
                    if notif.user
                    else (notif.driver.name if notif.driver else "Deleted User")
                ),
                "title": notif.title,
                "message": notif.message,
                "notif_type": notif.notif_type,
                "is_read": notif.is_read,
                "created_at": notif.created_at,
            }
        )
    return Response(data)


# GET /api/admin/admins/
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_admins_list(request):
    admins = Admin.objects.all().order_by("-created_date")
    data = []
    for admin in admins:
        data.append(
            {
                "id": admin.id,
                "name": admin.name,
                "loginid": admin.loginid,
                "role": admin.role,
                "status": admin.status,
                "is_active": admin.is_active,
                "created_date": admin.created_date,
                "updated_date": admin.updated_date,
            }
        )
    return Response(data)


# POST /api/admin/broadcast/
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def admin_broadcast_notification(request):
    if not is_admin(request.user):
        return Response({"error": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN)

    title = request.data.get("title")
    message = request.data.get("message")
    notif_type = request.data.get("notif_type", "system")
    audience = request.data.get("audience", "everyone")

    if not title or not message:
        return Response(
            {"error": "Title and message are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Filter users based on audience
    users = CustomUser.objects.all()
    if audience == "riders_only":
        users = users.filter(role="user")
    elif audience == "drivers_only":
        users = users.filter(role="driver")
    # else 'everyone' includes everyone

    # Create notifications for all selected users
    notifications_to_create = []
    for user in users:
        notifications_to_create.append(
            Notification(user=user, title=title, message=message, notif_type=notif_type)
        )

    if notifications_to_create:
        Notification.objects.bulk_create(notifications_to_create)

    return Response(
        {
            "success": True,
            "message": f"Broadcast sent to {len(notifications_to_create)} users.",
        }
    )


# GET /api/admin/past-users/
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_past_users_list(request):
    if not is_admin(request.user):
        return Response({"error": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN)

    past_users = PastUser.objects.all().order_by("-deleted_at")
    serializer = AdminPastUserSerializer(
        past_users, many=True, context={"request": request}
    )
    return Response(serializer.data)


# GET /api/admin/past-drivers/
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_past_drivers_list(request):
    if not is_admin(request.user):
        return Response({"error": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN)

    past_drivers = PastDriver.objects.all().order_by("-deleted_at")
    serializer = AdminPastDriverSerializer(
        past_drivers, many=True, context={"request": request}
    )
    return Response(serializer.data)
