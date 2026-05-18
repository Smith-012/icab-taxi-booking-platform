from django.db import migrations
from django.contrib.auth.hashers import make_password


def create_default_admin(apps, schema_editor):
    Admin = apps.get_model("accounts", "Admin")
    # Use the email from is_admin check in views.py
    admin_email = "adminicab@gmail.com"

    if not Admin.objects.filter(loginid=admin_email).exists():
        Admin.objects.create(
            name="Admin iCab",
            loginid=admin_email,
            password=make_password("Admin@123#Icab"),
            role="admin",
            status="active",
            is_active=True,
        )


def remove_default_admin(apps, schema_editor):
    Admin = apps.get_model("accounts", "Admin")
    Admin.objects.filter(loginid="adminicab@gmail.com").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0013_admin_remove_customuser_groups_and_more"),
    ]

    operations = [
        migrations.RunPython(create_default_admin, reverse_code=remove_default_admin),
    ]
