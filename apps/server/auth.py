"""In-process authentication adapter; same session and CSRF rules for all domains."""
from fastapi import Request, Response
from apps.finance.backend.auth import get_current_user
from apps.finance.backend.database import SessionLocal


def principal_checker(result_type, principal_type):
    def check(request: Request):
        response = Response()
        with SessionLocal() as db:
            user = get_current_user(request, response, db)
            principal = principal_type(user.id, user.username, user.display_name)
            db.commit()
        return result_type(principal, response.headers.getlist("set-cookie"))
    return check
