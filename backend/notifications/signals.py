from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from .models import Notification
from drivers.models import DriverProfile


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_rider_welcome_notification(sender, instance, created, **kwargs):
    """Auto-create a welcome notification when a new rider registers."""
    if created and instance.role == "user":
        Notification.objects.create(
            user=instance,
            title=f"Welcome to iCab, {instance.name}! 🏠",
            message="You're logged in as 🏠 Rider. Ready to go!",
            notif_type="system",
        )


@receiver(post_save, sender=DriverProfile)
def create_driver_welcome_notification(sender, instance, created, **kwargs):
    """Auto-create a welcome notification when a new driver registers."""
    if created:
        Notification.objects.create(
            driver=instance,
            title=f"Welcome to iCab, {instance.name}! 🚗",
            message="You're logged in as 🚗 Rider. Ready to go!",
            notif_type="system",
        )
