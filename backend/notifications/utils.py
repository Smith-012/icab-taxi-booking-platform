from .models import Notification


def create_notification(user, title, message, notif_type="system"):
    """Create a notification for a rider (CustomUser)."""
    return Notification.objects.create(
        user=user, title=title, message=message, notif_type=notif_type
    )


def create_driver_notification(driver, title, message, notif_type="system"):
    """Create a notification for a driver (DriverProfile)."""
    return Notification.objects.create(
        driver=driver, title=title, message=message, notif_type=notif_type
    )
