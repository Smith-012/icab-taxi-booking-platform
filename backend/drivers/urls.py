from django.urls import path
from . import views

urlpatterns = [
    path("profile/", views.driver_profile),
    path("toggle-online/", views.toggle_online),
    path("pending-rides/", views.pending_rides),
    path("rides/<int:pk>/accept/", views.accept_ride),
    path("rides/<int:pk>/start/", views.start_ride),
    path("rides/<int:pk>/decline/", views.decline_ride),
    path("rides/<int:pk>/complete/", views.complete_ride),
    path("rides/<int:pk>/cancel/", views.driver_cancel_ride),
    path("rides/<int:pk>/confirm-cash/", views.confirm_cash_payment),
    path("stats/", views.driver_stats),
    path("wallet/", views.driver_wallet_detail),
    path("wallet/transactions/", views.driver_wallet_transactions),
    path("wallet/add/", views.driver_add_money, name="driver_add_money"),
    path("wallet/withdraw/", views.driver_withdraw_money, name="driver_withdraw_money"),
    path("wallet/set-pin/", views.driver_set_pin, name="driver_set_pin"),
    path("wallet/verify-pin/", views.driver_verify_pin, name="driver_verify_pin"),
    path("wallet/freeze/", views.driver_toggle_freeze, name="driver_toggle_freeze"),
    path("logout/", views.driver_logout, name="driver_logout"),
]
