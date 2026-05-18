"""
Custom authentication for admin users with hardcoded credentials.
"""

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.core.cache import cache
import logging

logger = logging.getLogger(__name__)

# Admin logout token blacklist (tokens that have been logged out)
# Using Django's cache system for simplicity
ADMIN_LOGOUT_CACHE_KEY = "admin_logout_tokens"


def add_token_to_blacklist(token):
    """Add a token to the logout blacklist."""
    blacklist = cache.get(ADMIN_LOGOUT_CACHE_KEY, set())
    if not isinstance(blacklist, set):
        blacklist = set()
    blacklist.add(token)
    # Keep blacklist for 7 days (same as token lifetime)
    cache.set(ADMIN_LOGOUT_CACHE_KEY, blacklist, 60 * 60 * 24 * 7)
    logger.info(f"Token blacklisted: {token[:20]}...")


def is_token_blacklisted(token):
    """Check if a token is in the logout blacklist."""
    blacklist = cache.get(ADMIN_LOGOUT_CACHE_KEY, set())
    if not isinstance(blacklist, set):
        blacklist = set()
    return token in blacklist


def remove_token_from_blacklist(token):
    """Remove a specific token from the blacklist (called on fresh login)."""
    blacklist = cache.get(ADMIN_LOGOUT_CACHE_KEY, set())
    if not isinstance(blacklist, set):
        return
    blacklist.discard(token)
    cache.set(ADMIN_LOGOUT_CACHE_KEY, blacklist, 60 * 60 * 24 * 7)


def clear_token_blacklist():
    """Clear all blacklisted tokens (called on app startup)."""
    cache.delete(ADMIN_LOGOUT_CACHE_KEY)
    logger.info("Token blacklist cleared on app startup")


class AdminTokenAuthentication(BaseAuthentication):
    """
    Custom authentication to validate fake admin tokens generated during admin login.
    Admin tokens have format: admin_access_{email}
    """

    def authenticate(self, request):
        # Get the Authorization header
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")

        if not auth_header.startswith("Bearer "):
            return None  # Let other authenticators handle this

        token = auth_header[7:]  # Remove 'Bearer ' prefix

        # Check if token has been logged out
        if is_token_blacklisted(token):
            logger.warning(f"[AdminTokenAuth] Blacklisted token rejected")
            raise AuthenticationFailed("Token has been revoked (logged out)")

        # Check if this is an admin token (format: admin_access_{email}::{uuid})
        if token.startswith("admin_access_") or token.startswith("admin_refresh_"):
            # Extract email, handling the dynamic unique session ID format
            token_body = token.split("_", 2)[2] if "_" in token else ""
            email = token_body.split("::")[0] if "::" in token_body else token_body
            logger.debug(f"[AdminTokenAuth] Admin token accepted for: {email}")

            # === DATABASE-DRIVEN ADMIN LOOKUP ===
            try:
                from .models import Admin

                db_admin = Admin.objects.get(loginid=email)

                # Return session object populated with REAL database data
                admin_session = AdminUser(
                    id=db_admin.id,
                    email=db_admin.loginid,
                    name=db_admin.name,
                    role=db_admin.role,
                )
                return (admin_session, token)
            except Admin.DoesNotExist:
                logger.error(
                    f"[AdminTokenAuth] Token for {email} rejected: Admin non-existent in DB"
                )
                # Return None instead of raising error to allow 'AllowAny' views (like login) to proceed
                return None

        # Not an admin token, let other authenticators handle it
        return None


class AdminUser:
    """
    Mock user object for admin that satisfies DRF's authentication requirements.
    Wraps real database data while avoiding full CustomUser inheritance overhead.
    """

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

        # Satisfy DRF Serializer expectations (mirroring CustomUser fields)
        self.first_name = name.split(" ")[0] if " " in name else name
        self.last_name = (
            name.split(" ")[1] if " " in name and len(name.split(" ")) > 1 else ""
        )
        self.phone = ""
        self.gender = ""
        self.home_address = ""
        self.work_address = ""
        self.date_of_birth = None
        self.avatar = None
        self.created_at = None
        self.updated_at = None
        self.is_superuser = False
        self.is_staff = False

    def __str__(self):
        return self.name

    def has_perm(self, perm, obj=None):
        return True

    def has_module_perms(self, app_label):
        return True

    def get_profile_completion_percentage(self):
        """
        Admin profile is always 100% complete since it's hardcoded.
        This is called by UserSerializer when serializing the user object.
        """
        return 100
