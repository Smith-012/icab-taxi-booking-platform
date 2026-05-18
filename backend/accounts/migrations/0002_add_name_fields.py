# Generated migration for adding first_name and last_name fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="customuser",
            name="first_name",
            field=models.CharField(blank=True, max_length=10),
        ),
        migrations.AddField(
            model_name="customuser",
            name="last_name",
            field=models.CharField(blank=True, max_length=10),
        ),
    ]
