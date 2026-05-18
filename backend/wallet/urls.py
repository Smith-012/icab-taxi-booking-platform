from django.urls import path
from . import views

urlpatterns = [
    path("", views.wallet_detail),
    path("add-money/", views.add_money),
    path("transactions/", views.transactions_list),
    path("set-pin/", views.set_pin),
    path("verify-pin/", views.verify_pin),
    path("withdraw/", views.withdraw_money),
    path("freeze/", views.toggle_freeze),
]
