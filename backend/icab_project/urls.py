from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # path("admin/", admin.site.urls),  # Removed: using custom admin panel with custom admin app
    path("api/auth/", include("accounts.urls")),
    path("api/rides/", include("rides.urls")),
    path("api/driver/", include("drivers.urls")),
    path("api/wallet/", include("wallet.urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/admin/", include("adminapp.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
