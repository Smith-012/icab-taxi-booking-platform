from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.core.cache import cache
from django.conf import settings
import logging
import hmac
import hashlib
import time

logger = logging.getLogger(__name__)

# Driver logout token blacklist
DRIVER_LOGOUT_CACHE_KEY = "driver_logout_tokens"
TOKEN_EXPIRY_DAYS = 7


def generate_driver_token(driver_id):
    """
    Generate a secure HMAC-signed token.
    Format: driver_v2_{id}.{timestamp}.{signature}
    """
    timestamp = int(time.time())
    msg = f"{driver_id}:{timestamp}"
    signature = hmac.new(
        settings.SECRET_KEY.encode(), msg.encode(), hashlib.sha256
    ).hexdigest()
    return f"driver_v2_{driver_id}.{timestamp}.{signature}"


def verify_driver_token(token):
    """
    Verify the signature and timestamp of a driver token.
    Returns (driver_id, is_valid)
    """
    try:
        if not token.startswith("driver_v2_"):
            return None, False

        # Extract pieces
        parts = token.replace("driver_v2_", "").split(".")
        if len(parts) != 3:
            return None, False

        driver_id, timestamp, signature = parts
        timestamp = int(timestamp)

        # 1. Check Expiry (7 days)
        if time.time() - timestamp > (60 * 60 * 24 * TOKEN_EXPIRY_DAYS):
            return None, False

        # 2. Verify Signature
        msg = f"{driver_id}:{timestamp}"
        expected_signature = hmac.new(
            settings.SECRET_KEY.encode(), msg.encode(), hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature, expected_signature):
            return None, False

        return int(driver_id), True
    except Exception as e:
        logger.error(f"Token verification error: {e}")
        return None, False


def add_driver_token_to_blacklist(token):
    """Add a token to the logout blacklist."""
    blacklist = cache.get(DRIVER_LOGOUT_CACHE_KEY, set())
    if not isinstance(blacklist, set):
        blacklist = set()
    blacklist.add(token)
    cache.set(DRIVER_LOGOUT_CACHE_KEY, blacklist, 60 * 60 * 24 * 7)


def is_driver_token_blacklisted(token):
    """Check if a token is in the logout blacklist."""
    blacklist = cache.get(DRIVER_LOGOUT_CACHE_KEY, set())
    if not isinstance(blacklist, set):
        blacklist = set()
    return token in blacklist


class DriverTokenAuthentication(BaseAuthentication):
    """
    Custom authentication to validate secure HMAC-signed driver tokens.
    """

    def authenticate(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")

        if not auth_header.startswith("Bearer "):
            return None

        token = auth_header[7:]

        if is_driver_token_blacklisted(token):
            raise AuthenticationFailed("Token has been revoked (logged out)")

        driver_id, is_valid = verify_driver_token(token)
        if not is_valid:
            # Fallback for old tokens during transition (optional, but safer to just fail)
            # if token.startswith("driver_access_"): return None
            return None

        try:
            from .models import DriverProfile

            db_driver = DriverProfile.objects.get(id=driver_id)

            driver_session = DriverUser(
                id=db_driver.id,
                email=db_driver.email,
                name=db_driver.name,
                role=db_driver.role,
            )
            return (driver_session, token)
        except DriverProfile.DoesNotExist:
            return None

        return None


class DriverUser:
    """Mock user object to satisfy DRF's request.user for standalone Drivers."""

    def __init__(self, id, email, name, role):
        self.id = id
        self.email = email
        self.name = name
        self.role = role
        self.username = email
        self.pk = id
        self.is_authenticated = True
        self.is_active = True
        self.status = "active"

    def check_password(self, raw_password):
        """Proxy password check to DriverProfile model"""
        from .models import DriverProfile

        try:
            db_driver = DriverProfile.objects.get(id=self.id)
            return db_driver.check_password(raw_password)
        except DriverProfile.DoesNotExist:
            return False

    def set_password(self, raw_password):
        """Proxy set password to DriverProfile model"""
        from .models import DriverProfile

        try:
            db_driver = DriverProfile.objects.get(id=self.id)
            db_driver.set_password(raw_password)
            db_driver.save()
        except DriverProfile.DoesNotExist:
            pass

    def save(self, *args, **kwargs):
        """Mock save method"""
        pass

    def __str__(self):
        return self.name

    def has_perm(self, perm, obj=None):
        return True

    def has_module_perms(self, app_label):
        return True
