from rest_framework import status
from rest_framework.decorators import (
    api_view,
    permission_classes,
    authentication_classes,
)
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import logout
from .models import CustomUser, EmergencyContact, PastUser, PastEmergencyContact, Admin
from django.utils import timezone
from django.contrib.auth.hashers import check_password
import json
from .serializers import (
    RegisterSerializer,
    LoginSerializer,
    UserSerializer,
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    EmergencyContactSerializer,
)
from django.forms.models import model_to_dict

# Import driver auth utils
try:
    from drivers.authentication import DriverTokenAuthentication, generate_driver_token
except ImportError:
    generate_driver_token = None

# Import driver serializer for validation
try:
    from drivers.serializers import DriverProfileSerializer
    from drivers.authentication import DriverTokenAuthentication
except ImportError:
    DriverProfileSerializer = None
    DriverTokenAuthentication = None


def get_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
    }


def create_user_snapshot(user, request=None):
    """Return a JSON-serializable snapshot of the user including emergency contacts."""

    # Include all concrete fields from the model
    field_names = [f.name for f in user._meta.fields]
    snapshot = model_to_dict(user, fields=field_names)

    # Attach emergency contacts as a list of dicts
    try:
        contacts = list(
            user.emergency_contacts.all().values(
                "id", "name", "phone", "created_at", "updated_at"
            )
        )
    except Exception:
        contacts = []
    snapshot["emergency_contacts"] = contacts

    # Attach Wallet Balance
    if hasattr(user, "wallet"):
        snapshot["wallet_balance"] = str(user.wallet.balance)

    # Include avatar URL if request is provided
    if request and hasattr(user, "avatar") and user.avatar:
        try:
            snapshot["avatar_url"] = request.build_absolute_uri(user.avatar.url)
        except Exception:
            snapshot["avatar"] = getattr(user.avatar, "name", None)

    return snapshot


# POST /api/auth/register/
@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    role = request.data.get("role", "user")

    # === DRIVER REGISTRATION ===
    if role == "driver":
        from drivers.models import DriverProfile

        if not DriverProfileSerializer:
            return Response(
                {"error": "Driver registration is not available."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = request.data.get("email", "").strip()

        # Check if email already exists as a Driver
        if DriverProfile.objects.filter(email=email).exists():
            return Response(
                {"error": {"email": ["This email is already registered as a driver."]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        driver_data = {
            "name": request.data.get("name", "").strip(),
            "email": email,
            "password": request.data.get("password", ""),
            "phone": request.data.get("phone", "").strip(),
            "first_name": request.data.get("first_name", "").strip(),
            "last_name": request.data.get("last_name", "").strip(),
            "vehicle_model": request.data.get("vehicle_model", "").strip(),
            "vehicle_plate": request.data.get("vehicle_plate", "").strip(),
            "license_no": request.data.get("license_no", "").strip(),
        }

        profile_serializer = DriverProfileSerializer(data=driver_data)
        if not profile_serializer.is_valid():
            return Response(
                {
                    "error": "Driver registration failed.",
                    "details": profile_serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        driver = profile_serializer.save()

        # Generate secure signed driver tokens
        tokens = {
            "refresh": (
                generate_driver_token(driver.id)
                if generate_driver_token
                else f"driver_refresh_{driver.id}"
            ),
            "access": (
                generate_driver_token(driver.id)
                if generate_driver_token
                else f"driver_access_{driver.id}"
            ),
        }

        return Response(
            {
                "message": "Driver registration successful.",
                "user": profile_serializer.data,
                "driver": profile_serializer.data,
                **tokens,
            },
            status=status.HTTP_201_CREATED,
        )

    # === USER REGISTRATION (Rider/Admin) ===
    # SECURITY: Explicitly override role to prevent privilege escalation to 'admin'
    reg_data = request.data.copy()
    if reg_data.get("role") != "driver":
        reg_data["role"] = "user"

    serializer = RegisterSerializer(data=reg_data)
    if serializer.is_valid():
        user = serializer.save()
        tokens = get_tokens(user)

        return Response(
            {
                "message": "Registration successful.",
                "user": UserSerializer(user, context={"request": request}).data,
                **tokens,
            },
            status=status.HTTP_201_CREATED,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# POST /api/auth/login/
@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    try:
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]
        role = serializer.validated_data.get("role")

        # === AMBIGUITY DETECTION (Dual Roles) ===
        # If no role is specified, check if multiple accounts have this valid email/password
        if not role:
            matching_roles = []

            # Check Admin
            try:
                admin = Admin.objects.get(loginid=email)
                if check_password(password, admin.password):
                    matching_roles.append("admin")
            except Admin.DoesNotExist:
                pass

            # Check Driver
            from drivers.models import DriverProfile

            try:
                driver = DriverProfile.objects.get(email=email)
                if check_password(password, driver.password):
                    matching_roles.append("driver")
            except DriverProfile.DoesNotExist:
                pass

            # Check Rider/User
            try:
                rider = CustomUser.objects.get(email=email, role="user")
                if rider.check_password(password):
                    matching_roles.append("user")
            except CustomUser.DoesNotExist:
                pass

            # If multiple accounts found, return choice response
            if len(matching_roles) > 1:
                return Response(
                    {
                        "multiple_accounts": True,
                        "roles": matching_roles,
                        "email": email,
                        "message": "Multiple accounts found. Please select a role.",
                    },
                    status=status.HTTP_200_OK,
                )
            elif len(matching_roles) == 1:
                role = matching_roles[0]

        # === ADMIN LOGIN - CHECK ADMIN TABLE ===
        try:
            admin = Admin.objects.get(loginid=email)
            # Verify password using Django's password hasher
            if check_password(password, admin.password):
                # Admin authenticated successfully
                admin_data = {
                    "id": admin.id,
                    "name": admin.name,
                    "email": admin.loginid,
                    "role": admin.role,
                    "status": admin.status,
                    "is_active": admin.is_active,
                    "profile_completion_percentage": 100,
                }

                # Generate tokens
                import uuid

                unique_session_id = uuid.uuid4().hex
                tokens = {
                    "refresh": f"admin_refresh_{email}::{unique_session_id}",
                    "access": f"admin_access_{email}::{unique_session_id}",
                }

                from accounts.auth import remove_token_from_blacklist

                remove_token_from_blacklist(tokens["access"])

                response = Response(
                    {
                        "message": "Admin login successful.",
                        "user": admin_data,
                        **tokens,
                    }
                )

                # Set HttpOnly cookies
                from django.conf import settings

                response.set_cookie(
                    key="icab_access",
                    value=tokens["access"],
                    max_age=settings.AUTH_COOKIE_AGE,
                    secure=settings.AUTH_COOKIE_SECURE,
                    httponly=settings.AUTH_COOKIE_HTTPONLY,
                    samesite=settings.AUTH_COOKIE_SAMESITE,
                )
                response.set_cookie(
                    key="icab_refresh",
                    value=tokens["refresh"],
                    max_age=settings.AUTH_COOKIE_AGE * 4,
                    secure=settings.AUTH_COOKIE_SECURE,
                    httponly=settings.AUTH_COOKIE_HTTPONLY,
                    samesite=settings.AUTH_COOKIE_SAMESITE,
                )

                return response
            else:
                return Response(
                    {"error": "Invalid email or password."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
        except Admin.DoesNotExist:
            pass  # Not an admin, try regular user login

        # === DRIVER LOGIN ===
        if role == "driver":
            from drivers.models import DriverProfile

            try:
                driver = DriverProfile.objects.get(email=email)
            except DriverProfile.DoesNotExist:
                return Response(
                    {"error": "Invalid email or password."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

            # Check password
            if not check_password(password, driver.password):
                return Response(
                    {"error": "Invalid email or password."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

            if driver.status == "suspended":
                return Response(
                    {"error": "Your account has been suspended."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            # Update last_login and force offline status on login
            try:
                driver.last_login = timezone.now()
                driver.is_online = False
                driver.save(update_fields=["last_login", "is_online"])
            except Exception:
                pass

            # Generate secure tokens for driver
            tokens = {
                "refresh": (
                    generate_driver_token(driver.id)
                    if generate_driver_token
                    else f"driver_refresh_{driver.id}"
                ),
                "access": (
                    generate_driver_token(driver.id)
                    if generate_driver_token
                    else f"driver_access_{driver.id}"
                ),
            }

            response = Response(
                {
                    "message": "Login successful.",
                    "user": DriverProfileSerializer(driver).data,
                    **tokens,
                }
            )

            # Set HttpOnly cookies
            from django.conf import settings

            response.set_cookie(
                key="icab_access",
                value=tokens["access"],
                max_age=settings.AUTH_COOKIE_AGE,
                secure=settings.AUTH_COOKIE_SECURE,
                httponly=settings.AUTH_COOKIE_HTTPONLY,
                samesite=settings.AUTH_COOKIE_SAMESITE,
            )
            response.set_cookie(
                key="icab_refresh",
                value=tokens["refresh"],
                max_age=settings.AUTH_COOKIE_AGE * 4,
                secure=settings.AUTH_COOKIE_SECURE,
                httponly=settings.AUTH_COOKIE_HTTPONLY,
                samesite=settings.AUTH_COOKIE_SAMESITE,
            )

            return response

        # === USER/RIDER LOGIN (from users table) ===
        # Find user by email
        try:
            user_obj = CustomUser.objects.get(email=email)
        except CustomUser.DoesNotExist:
            return Response(
                {"error": "Invalid email or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # If role specified, verify the user actually holds that role
        if role == "user":
            if user_obj.role not in ["user", "driver"]:
                return Response(
                    {"error": "No user account found with this email."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

        # Authenticate password
        if user_obj.check_password(password):
            user = user_obj
        else:
            user = None

        if not user:
            return Response(
                {"error": "Invalid email or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if user.status == "suspended":
            return Response(
                {"error": "Your account has been suspended."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Update last_login timestamp
        try:
            user.last_login = timezone.now()
            user.save(update_fields=["last_login"])
        except Exception:
            pass

        tokens = get_tokens(user)

        user_data = UserSerializer(user, context={"request": request}).data
        # If they successfully authenticated into a specific role, ensure the frontend gets that role
        if role:
            user_data["role"] = role

        response = Response(
            {
                "message": "Login successful.",
                "user": user_data,
                **tokens,
            }
        )

        # Set HttpOnly cookies for tokens (secure storage)
        from django.conf import settings

        response.set_cookie(
            key="icab_access",
            value=tokens["access"],
            max_age=settings.AUTH_COOKIE_AGE,
            secure=settings.AUTH_COOKIE_SECURE,
            httponly=settings.AUTH_COOKIE_HTTPONLY,
            samesite=settings.AUTH_COOKIE_SAMESITE,
        )
        response.set_cookie(
            key="icab_refresh",
            value=tokens["refresh"],
            max_age=settings.AUTH_COOKIE_AGE * 4,  # Longer for refresh
            secure=settings.AUTH_COOKIE_SECURE,
            httponly=settings.AUTH_COOKIE_HTTPONLY,
            samesite=settings.AUTH_COOKIE_SAMESITE,
        )

        return response

    except Exception as e:
        # Log the actual error for debugging
        import logging

        logger = logging.getLogger(__name__)
        logger.error(f"Login error: {str(e)}", exc_info=True)

        # Return generic error message to client
        return Response(
            {"error": "Server error during login. Please try again later."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# GET/PUT/DELETE /api/auth/me/
@api_view(["GET", "PUT", "DELETE"])
@permission_classes([AllowAny])  # Changed to AllowAny to handle missing auth gracefully
def me(request):
    try:
        from drivers.authentication import DriverUser

        # Check if it's a driver token — handle driver profile data
        if DriverUser and isinstance(request.user, DriverUser):
            from drivers.models import DriverProfile, PastDriver

            try:
                driver = DriverProfile.objects.get(id=request.user.id)

                if request.method == "GET":
                    data = {
                        "id": driver.id,
                        "name": driver.name,
                        "email": driver.email,
                        "role": "driver",
                        "status": driver.status,
                        "is_active": driver.is_active,
                        "profile_completion_percentage": driver.profile_completion_percentage,
                        "avatar_url": (
                            request.build_absolute_uri(driver.avatar.url)
                            if driver.avatar
                            else None
                        ),
                    }
                    return Response(data)

                if request.method == "DELETE":
                    # Create snapshot for archive
                    snapshot = {
                        "id": driver.id,
                        "name": driver.name,
                        "email": driver.email,
                        "phone": driver.phone,
                        "role": "driver",
                        "vehicle_model": driver.vehicle_model,
                        "vehicle_plate": driver.vehicle_plate,
                        "license_no": driver.license_no,
                        "total_rides": driver.total_rides,
                        "total_earnings": float(driver.total_earnings),
                        "rating": float(driver.rating),
                        "wallet_balance": (
                            str(getattr(driver.wallet, "balance", 0))
                            if hasattr(driver, "wallet")
                            else "0.00"
                        ),
                        "created_at": str(driver.created_at),
                        "updated_at": str(driver.updated_at),
                    }

                    # Save to PastDriver
                    PastDriver.objects.create(
                        original_id=driver.id,
                        email=driver.email,
                        name=driver.name,
                        first_name=driver.first_name,
                        last_name=driver.last_name,
                        last_login=driver.last_login,
                        phone=driver.phone,
                        gender=driver.gender,
                        date_of_birth=driver.date_of_birth,
                        avatar=driver.avatar.name if driver.avatar else None,
                        role="driver",
                        vehicle_model=driver.vehicle_model,
                        vehicle_plate=driver.vehicle_plate,
                        license_no=driver.license_no,
                        total_rides=driver.total_rides,
                        total_earnings=driver.total_earnings,
                        rating=driver.rating,
                        created_at=driver.created_at,
                        updated_at=driver.updated_at,
                        data=json.dumps(snapshot, default=str),
                    )

                    driver.delete()
                    return Response({"message": "Driver account archived and deleted."})

            except DriverProfile.DoesNotExist:
                return Response(
                    {"error": "Driver profile not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            except Exception as e:
                import logging

                logging.getLogger(__name__).error(f"Error handling driver me: {str(e)}")
    except ImportError:
        pass
    # Manually check if user is authenticated
    if not request.user or not hasattr(request.user, "id") or request.user.id is None:
        return Response(
            {"error": "Not authenticated. Please login first."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if request.method == "GET":
        serializer = UserSerializer(request.user, context={"request": request})
        return Response(serializer.data)

    # DELETE — delete account (archive then remove)
    if request.method == "DELETE":
        user = request.user
        try:
            # Create a full snapshot (includes emergency contacts) and store in PastUser
            snapshot = create_user_snapshot(user, request)

            past = PastUser.objects.create(
                original_id=user.id,
                email=user.email,
                name=user.name,
                role=getattr(user, "role", ""),
                last_login=getattr(user, "last_login", None),
                phone=getattr(user, "phone", None),
                gender=getattr(user, "gender", None),
                home_address=getattr(user, "home_address", None),
                work_address=getattr(user, "work_address", None),
                date_of_birth=getattr(user, "date_of_birth", None),
                avatar=(user.avatar.name if getattr(user, "avatar", None) else None),
                created_at=getattr(user, "created_at", None),
                updated_at=getattr(user, "updated_at", None),
                first_name=getattr(user, "first_name", None),
                last_name=getattr(user, "last_name", None),
                data=json.dumps(snapshot, default=str),
            )

            # Archive emergency contacts into separate table
            try:
                for c in user.emergency_contacts.all():
                    PastEmergencyContact.objects.create(
                        past_user=past,
                        original_id=c.id,
                        name=c.name,
                        phone=c.phone,
                        created_at=c.created_at,
                        updated_at=c.updated_at,
                    )
            except Exception:
                # best-effort: continue if contacts fail to archive
                pass
        except Exception as e:
            # Log and continue with deletion
            import logging

            logging.getLogger(__name__).error(
                "Failed to archive user before delete: %s", str(e)
            )

        user.delete()
        return Response({"message": "Account archived and deleted."})

    # PUT — update profile
    # Handle physical file removal if empty string or None passed
    if "avatar" in request.data and (
        request.data["avatar"] == "" or request.data["avatar"] is None
    ):
        if request.user.avatar:
            request.user.avatar.delete(save=False)
        request.user.avatar = None

    # Handle Base64 Upload
    avatar_data = request.data.get("avatar")
    if (
        avatar_data
        and isinstance(avatar_data, str)
        and avatar_data.startswith("data:image")
    ):
        try:
            import base64
            from django.core.files.base import ContentFile

            format, imgstr = avatar_data.split(";base64,")
            ext = format.split("/")[-1]
            if request.user.avatar:
                request.user.avatar.delete(save=False)
            request.user.avatar = ContentFile(
                base64.b64decode(imgstr), name=f"avatar_{request.user.id}.{ext}"
            )

            # Clean up avatar from request.data to avoid validation errors
            update_data = request.data.copy()
            update_data.pop("avatar")
            serializer = UserSerializer(
                request.user,
                data=update_data,
                partial=True,
                context={"request": request},
            )
        except Exception:
            return Response(
                {"error": "Invalid image format."}, status=status.HTTP_400_BAD_REQUEST
            )
    else:
        # If avatar is a URL string (not a base64 or empty), remove it from data
        # so UserSerializer doesn't try to validate it as a file upload.
        update_data = request.data.copy()
        if (
            "avatar" in update_data
            and isinstance(update_data["avatar"], str)
            and update_data["avatar"].startswith("http")
        ):
            update_data.pop("avatar")

        serializer = UserSerializer(
            request.user, data=update_data, partial=True, context={"request": request}
        )

    if serializer.is_valid():
        # Also support multipart file uploads (standard request.FILES)
        if "avatar" in request.FILES:
            if request.user.avatar:
                request.user.avatar.delete(save=False)
            request.user.avatar = request.FILES["avatar"]

        serializer.save()
        return Response(
            {
                "message": "Profile updated.",
                "user": UserSerializer(request.user, context={"request": request}).data,
            }
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# POST /api/auth/verify-password/
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_password(request):
    """Verify if the provided password matches user's current password"""
    password = request.data.get("password", "").strip()

    if not password:
        return Response(
            {"error": "Password is required."}, status=status.HTTP_400_BAD_REQUEST
        )

    user = request.user
    is_valid = user.check_password(password)

    return Response({"valid": is_valid})


# POST /api/auth/change-password/
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    serializer = ChangePasswordSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    if not user.check_password(serializer.validated_data["old_password"]):
        return Response(
            {"error": "Old password is incorrect."}, status=status.HTTP_400_BAD_REQUEST
        )

    user.set_password(serializer.validated_data["new_password"])
    user.save()
    return Response({"message": "Password changed successfully."})


# GET /api/auth/check-email/
# For registration - check if email already exists for a specific role
@api_view(["GET"])
@permission_classes([AllowAny])
def check_email(request):
    email = request.query_params.get("email", "").strip()
    role = request.query_params.get("role", "user")  # default to "user"

    if not email:
        return Response(
            {"error": "Email is required."}, status=status.HTTP_400_BAD_REQUEST
        )

    # Check correct table based on role
    if role == "driver":
        from drivers.models import DriverProfile

        exists = DriverProfile.objects.filter(email=email).exists()
    else:
        # Default to CustomUser (Rider/Admin)
        exists = CustomUser.objects.filter(email=email, role=role).exists()

    return Response({"exists": exists})


# GET /api/auth/check-phone/
# For registration - check if phone already exists for a specific role
@api_view(["GET"])
@permission_classes([AllowAny])
def check_phone(request):
    phone = request.query_params.get("phone", "").strip()
    role = request.query_params.get("role", "user")  # default to "user"

    if not phone:
        return Response(
            {"error": "Phone is required."}, status=status.HTTP_400_BAD_REQUEST
        )

    # Normalize phone: ensure +91 prefix for database matching
    if not phone.startswith("+91") and len(phone) == 10:
        phone = "+91" + phone

    # Check correct table and match both raw and formatted phone
    if role == "driver":
        from drivers.models import DriverProfile

        # Check for both raw phone and +91 version
        exists = DriverProfile.objects.filter(phone=phone).exists()
        if not exists and phone.startswith("+91"):
            raw_phone = phone[3:]  # Remove +91
            exists = DriverProfile.objects.filter(phone=raw_phone).exists()
        elif not exists and not phone.startswith("+91") and len(phone) == 10:
            prefixed_phone = "+91" + phone
            exists = DriverProfile.objects.filter(phone=prefixed_phone).exists()
    else:
        # Default to CustomUser (Rider/Admin)
        exists = CustomUser.objects.filter(phone=phone, role=role).exists()
        if not exists and phone.startswith("+91"):
            raw_phone = phone[3:]
            exists = CustomUser.objects.filter(phone=raw_phone, role=role).exists()
        elif not exists and not phone.startswith("+91") and len(phone) == 10:
            prefixed_phone = "+91" + phone
            exists = CustomUser.objects.filter(phone=prefixed_phone, role=role).exists()

    return Response({"exists": exists})


# GET /api/auth/lookup-user/
# For forgot password flow - lookup user by email or phone
@api_view(["GET"])
@permission_classes([AllowAny])
def lookup_user(request):
    """
    Lookup user or driver by email or phone.
    Admin accounts are intentionally excluded from this public endpoint.
    """
    email = request.query_params.get("email", "").strip()
    phone = request.query_params.get("phone", "").strip()

    if not email and not phone:
        return Response(
            {"error": "Either email or phone is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    users = []
    try:
        # Search CustomUser Table (Riders)
        rider_query = CustomUser.objects.filter(role="user")
        if email:
            rider_query = rider_query.filter(email=email)
        elif phone:
            rider_query = rider_query.filter(phone=phone)

        for u in rider_query.values("id", "name", "role"):
            users.append(u)

        # Search DriverProfile Table (Drivers)
        from drivers.models import DriverProfile

        driver_query = DriverProfile.objects.all()
        if email:
            driver_query = driver_query.filter(email=email)
        elif phone:
            driver_query = driver_query.filter(phone=phone)

        for d in driver_query:
            users.append({"id": d.id, "name": d.name, "role": "driver"})

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    if not users:
        msg = (
            "No account found with this email."
            if email
            else "No account found with this phone number."
        )
        return Response({"error": msg}, status=status.HTTP_404_NOT_FOUND)

    return Response({"users": users})


# POST /api/auth/check-password/
# For forgot password flow - check if new password matches current password
@api_view(["POST"])
@permission_classes([AllowAny])
def validate_password(request):
    """
    Live validation: checks if new_password matches current password for User/Driver.
    Returns {"is_duplicate": True} if passwords match.
    """
    email = request.data.get("email", "").strip()
    phone = request.data.get("phone", "").strip()
    new_password = request.data.get("new_password", "").strip()
    role = request.data.get("role", "user")

    if role == "admin":
        return Response({"is_duplicate": False})  # Admins excluded from this logic

    if not (email or phone) or not new_password:
        return Response(
            {"error": "Email/phone and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        if role == "driver":
            from drivers.models import DriverProfile

            if email:
                user = DriverProfile.objects.get(email=email)
            else:
                user = DriverProfile.objects.get(phone=phone)
        else:
            # Default to Rider (CustomUser)
            if email:
                user = CustomUser.objects.get(email=email, role="user")
            else:
                user = CustomUser.objects.get(phone=phone, role="user")
    except (CustomUser.DoesNotExist, Exception):
        return Response({"is_duplicate": False})

    # Check if new password matches current password
    is_same = user.check_password(new_password)
    return Response({"is_duplicate": is_same})


# POST /api/auth/forgot-password/
@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password(request):
    """
    Final Reset flow: Saves new password for Riders or Drivers.
    Admins are excluded and must use the Admin Panel.
    """
    serializer = ForgotPasswordSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = serializer.validated_data.get("email")
    phone = serializer.validated_data.get("phone")
    new_password = serializer.validated_data["new_password"]
    role = serializer.validated_data.get("role", "user")

    if role == "admin":
        return Response(
            {"error": "Administrative accounts cannot be reset from this page."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        if role == "driver":
            from drivers.models import DriverProfile

            if email:
                user = DriverProfile.objects.get(email=email)
            else:
                user = DriverProfile.objects.get(phone=phone)
        else:
            # Default to Rider (CustomUser)
            if email:
                user = CustomUser.objects.get(email=email, role="user")
            else:
                user = CustomUser.objects.get(phone=phone, role="user")
    except (CustomUser.DoesNotExist, Exception):
        msg = "No account found matching these details."
        return Response({"error": msg}, status=status.HTTP_404_NOT_FOUND)

    # Re-verify one last time in the backend that it's not a duplicate
    if user.check_password(new_password):
        return Response(
            {"error": "New password cannot be the same as your old password."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(new_password)
    user.save()
    return Response({"message": "Password reset successfully."})


# POST /api/auth/logout/ or GET /api/auth/logout/
@api_view(["POST", "GET"])
@permission_classes([IsAuthenticated])
def logout(request):
    """
    Logout endpoint to terminate user/admin session.
    Accepts both POST and GET requests.
    Clears tokens and blacklists JWT tokens for regular users.
    """
    try:
        # Get refresh token from request data or query params
        refresh_token = (
            request.data.get("refresh")
            if request.method == "POST"
            else request.GET.get("refresh")
        )

        if refresh_token:
            # Check if it's an admin token
            if refresh_token.startswith("admin_refresh_"):
                # Admin token - add to logout blacklist
                from accounts.auth import add_token_to_blacklist

                access_token = request.META.get("HTTP_AUTHORIZATION", "").replace(
                    "Bearer ", ""
                )
                if access_token.startswith("admin_access_"):
                    add_token_to_blacklist(access_token)
                add_token_to_blacklist(refresh_token)
            # Check if it's a driver token
            elif refresh_token.startswith("driver_refresh_"):
                from drivers.authentication import add_driver_token_to_blacklist

                access_token = request.META.get("HTTP_AUTHORIZATION", "").replace(
                    "Bearer ", ""
                )
                if access_token.startswith("driver_access_"):
                    add_driver_token_to_blacklist(access_token)
                add_driver_token_to_blacklist(refresh_token)

                # Force offline status on logout
                try:
                    from drivers.models import DriverProfile

                    driver = DriverProfile.objects.get(id=request.user.id)
                    driver.is_online = False
                    driver.save(update_fields=["is_online"])
                except Exception:
                    pass

            else:
                # Regular JWT token - blacklist it
                try:
                    token = RefreshToken(refresh_token)
                    token.blacklist()
                except Exception:
                    # Token might not exist or already blacklisted
                    pass
    except Exception:
        pass

    response = Response(
        {"message": "Logged out successfully.", "status": "session_terminated"}
    )

    # Clear authentication cookies to terminate session
    response.delete_cookie("icab_access")
    response.delete_cookie("icab_refresh")
    response.delete_cookie("icab_driver_access")
    response.delete_cookie("icab_driver_refresh")

    # Also clear any localStorage keys that were set
    response["Clear-Site-Data"] = '"cache", "cookies", "storage"'

    return response


# DELETE /api/auth/delete-account/
@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_account(request):
    user = request.user
    try:
        snapshot = create_user_snapshot(user, request)

        past = PastUser.objects.create(
            original_id=user.id,
            email=user.email,
            name=user.name,
            role=getattr(user, "role", ""),
            password=getattr(user, "password", None),
            last_login=getattr(user, "last_login", None),
            is_superuser=False,
            phone=getattr(user, "phone", None),
            gender=getattr(user, "gender", None),
            home_address=getattr(user, "home_address", None),
            work_address=getattr(user, "work_address", None),
            date_of_birth=getattr(user, "date_of_birth", None),
            avatar=(user.avatar.name if getattr(user, "avatar", None) else None),
            status=getattr(user, "status", None),
            is_active=getattr(user, "is_active", False),
            is_staff=False,
            created_at=getattr(user, "created_at", None),
            updated_at=getattr(user, "updated_at", None),
            first_name=getattr(user, "first_name", None),
            last_name=getattr(user, "last_name", None),
            data=json.dumps(snapshot, default=str),
        )

        # Archive emergency contacts into separate table
        try:
            for c in user.emergency_contacts.all():
                PastEmergencyContact.objects.create(
                    past_user=past,
                    original_id=c.id,
                    name=c.name,
                    phone=c.phone,
                    created_at=c.created_at,
                    updated_at=c.updated_at,
                )
        except Exception:
            pass
    except Exception as e:
        import logging

        logging.getLogger(__name__).error(
            "Failed to archive user in delete_account: %s", str(e)
        )

    user.delete()
    return Response({"message": "Account archived and deleted."})


# GET/POST /api/auth/emergency-contacts/
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def emergency_contacts_list(request):
    """Get all emergency contacts or create a new one for the authenticated user"""
    import logging

    logger = logging.getLogger(__name__)

    if request.method == "GET":
        logger.info(
            f"Getting emergency contacts for user: {request.user.id} ({request.user.email})"
        )
        contacts = request.user.emergency_contacts.all()
        logger.info(f"Found {contacts.count()} emergency contacts")
        serializer = EmergencyContactSerializer(contacts, many=True)
        logger.info(f"Serialized data: {serializer.data}")
        return Response({"contacts": serializer.data})

    # POST — Create emergency contact
    logger.info(f"Creating emergency contact for user: {request.user.id}")

    # Check if user already has 3 emergency contacts
    contact_count = request.user.emergency_contacts.count()
    if contact_count >= 3:
        return Response(
            {"error": "You can only add up to 3 emergency contacts."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = EmergencyContactSerializer(data=request.data)
    if serializer.is_valid():
        logger.info(
            f"Valid data, saving contact with data: {serializer.validated_data}"
        )
        serializer.save(user=request.user)
        logger.info(f"Contact saved successfully, data: {serializer.data}")
        return Response(
            {"message": "Emergency contact added.", "contact": serializer.data},
            status=status.HTTP_201_CREATED,
        )
    logger.error(f"Validation errors: {serializer.errors}")
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# PUT/DELETE /api/auth/emergency-contacts/<id>/
@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def emergency_contact_detail(request, contact_id):
    """Update or delete a specific emergency contact"""
    try:
        contact = EmergencyContact.objects.get(id=contact_id, user=request.user)
    except EmergencyContact.DoesNotExist:
        return Response(
            {"error": "Emergency contact not found."}, status=status.HTTP_404_NOT_FOUND
        )

    if request.method == "DELETE":
        contact.delete()
        return Response({"message": "Emergency contact deleted."})

    # PUT — Update emergency contact
    serializer = EmergencyContactSerializer(contact, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(
            {"message": "Emergency contact updated.", "contact": serializer.data}
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
