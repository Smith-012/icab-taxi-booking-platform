from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Notification
from .serializers import NotificationSerializer


# GET /api/notifications/
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def notif_list(request):
    if request.method == "GET":
        # Check if user is admin
        if hasattr(request.user, "role") and request.user.role == "admin":
            # Admin doesn't have notifications
            return Response([])

        from drivers.authentication import DriverUser

        if isinstance(request.user, DriverUser):
            notifs = Notification.objects.filter(driver_id=request.user.id)
        else:
            notifs = request.user.notifications.all()

        return Response(NotificationSerializer(notifs, many=True).data)

    elif request.method == "POST":
        # Check if user is admin
        if hasattr(request.user, "role") and request.user.role == "admin":
            # Admin can create notifications for testing, but they don't appear in their list
            return Response(
                {"message": "Notification created (not visible to admin)", "id": None},
                status=status.HTTP_201_CREATED,
            )

        # Create a new notification for the logged-in user
        title = request.data.get("title", "Notification")
        message = request.data.get("message", "")
        # Support both names for compatibility
        notif_type = (
            request.data.get("notif_type")
            or request.data.get("notification_type")
            or "system"
        )

        from drivers.authentication import DriverUser

        if isinstance(request.user, DriverUser):
            notif = Notification.objects.create(
                driver_id=request.user.id,
                title=title,
                message=message,
                notif_type=notif_type,
            )
        else:
            notif = Notification.objects.create(
                user=request.user, title=title, message=message, notif_type=notif_type
            )
        return Response(
            NotificationSerializer(notif).data, status=status.HTTP_201_CREATED
        )


# POST /api/notifications/mark-read/
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_all_read(request):
    # Skip for admin users
    if hasattr(request.user, "role") and request.user.role == "admin":
        return Response({"message": "Admin users don't have notifications."})

    from drivers.authentication import DriverUser

    if isinstance(request.user, DriverUser):
        Notification.objects.filter(driver_id=request.user.id, is_read=False).update(
            is_read=True
        )
    else:
        request.user.notifications.filter(is_read=False).update(is_read=True)
    return Response({"message": "All notifications marked as read."})


# POST /api/notifications/{id}/read/
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_one_read(request, pk):
    # Skip for admin users
    if hasattr(request.user, "role") and request.user.role == "admin":
        return Response({"message": "Admin users don't have notifications."})

    try:
        from drivers.authentication import DriverUser

        if isinstance(request.user, DriverUser):
            notif = Notification.objects.get(pk=pk, driver_id=request.user.id)
        else:
            notif = getattr(request.user, "notifications").get(pk=pk)

        # Support both marking as read and unread
        is_read = request.data.get("is_read", True)
        notif.is_read = is_read
        notif.save()
        status_msg = "marked as read" if is_read else "marked as unread"
        return Response({"message": f"Notification {status_msg}."})
    except (Notification.DoesNotExist, AttributeError):
        return Response(status=status.HTTP_404_NOT_FOUND)


# DELETE /api/notifications/{id}/
@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def notif_detail(request, pk):
    # Skip for admin users
    if hasattr(request.user, "role") and request.user.role == "admin":
        return Response({"message": "Admin users don't have notifications."})

    try:
        from drivers.authentication import DriverUser

        if isinstance(request.user, DriverUser):
            notif = Notification.objects.get(pk=pk, driver_id=request.user.id)
        else:
            notif = getattr(request.user, "notifications").get(pk=pk)
        notif.delete()
        return Response({"message": "Notification deleted."})
    except (Notification.DoesNotExist, AttributeError):
        return Response(status=status.HTTP_404_NOT_FOUND)


# DELETE /api/notifications/clear/
@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def clear_all(request):
    # Skip for admin users
    if hasattr(request.user, "role") and request.user.role == "admin":
        return Response({"message": "Admin users don't have notifications."})

    from drivers.authentication import DriverUser

    if isinstance(request.user, DriverUser):
        Notification.objects.filter(driver_id=request.user.id).delete()
    else:
        request.user.notifications.all().delete()
    return Response({"message": "All notifications cleared."})
