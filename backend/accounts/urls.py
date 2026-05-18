from django.urls import path
from . import views

urlpatterns = [
    path("register/", views.register),
    path("login/", views.login),
    path("me/", views.me),
    path("verify-password/", views.verify_password),
    path("change-password/", views.change_password),
    path("check-email/", views.check_email),
    path("check-phone/", views.check_phone),
    path("lookup-user/", views.lookup_user),
    path("check-password/", views.validate_password),
    path("forgot-password/", views.forgot_password),
    path("logout/", views.logout),
    path("delete-account/", views.delete_account),
    path("emergency-contacts/", views.emergency_contacts_list),
    path("emergency-contacts/<int:contact_id>/", views.emergency_contact_detail),
]
