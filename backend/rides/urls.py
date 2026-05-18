from django.urls import path
from . import views

urlpatterns = [
    path("", views.ride_list),
    path("estimate/", views.fare_estimate),
    path("book/", views.book_ride),
    path("<int:pk>/", views.ride_detail),
    path("<int:pk>/cancel/", views.cancel_ride),
    path("<int:pk>/rate/", views.rate_ride),
    path("<int:pk>/pay/wallet/", views.pay_with_wallet),
    path("<int:pk>/pay/upi/", views.pay_with_upi),
]
