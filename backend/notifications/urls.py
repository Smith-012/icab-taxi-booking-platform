from django.urls import path
from . import views

urlpatterns = [
    path("", views.notif_list),
    path("mark-read/", views.mark_all_read),
    path("<int:pk>/", views.notif_detail),
    path("<int:pk>/read/", views.mark_one_read),
    path("clear/", views.clear_all),
]
