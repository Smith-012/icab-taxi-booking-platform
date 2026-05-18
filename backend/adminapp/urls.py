from django.urls import path
from . import views

urlpatterns = [
    path("stats/", views.admin_stats),
    path("users/", views.admin_users_list),
    path("users/<int:pk>/", views.admin_update_user),
    path("users/<int:pk>/delete/", views.admin_delete_user),
    path("rides/", views.admin_rides_list),
    path("drivers/", views.admin_drivers_list),
    path("wallets/", views.admin_wallets_list),
    path("notifications/", views.admin_notifications_list),
    path("admins/", views.admin_admins_list),
    path("broadcast/", views.admin_broadcast_notification),
    path("past-users/", views.admin_past_users_list),
    path("past-drivers/", views.admin_past_drivers_list),
]
