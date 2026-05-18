from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "accounts"

    def ready(self):
        """Clear token blacklist on app startup to prevent false logouts."""
        try:
            from .auth import clear_token_blacklist

            clear_token_blacklist()
        except Exception as e:
            print(f"Warning: Could not clear token blacklist on startup: {e}")
