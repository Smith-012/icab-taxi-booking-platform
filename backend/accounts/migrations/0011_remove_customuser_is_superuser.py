# Generated migration to remove is_superuser field

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        (
            "accounts",
            "0010_remove_customuser_address_remove_customuser_is_staff_and_more",
        ),
    ]

    operations = [
        migrations.RemoveField(
            model_name="customuser",
            name="is_superuser",
        ),
    ]
