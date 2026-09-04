
 
import firebase_admin
from firebase_admin import credentials, auth
 
cred = credentials.Certificate("firebase-service-account.json")
firebase_admin.initialize_app(cred)
 

LOGINS = [
    {"email": "rohan.deshmukh@example.com", "password": "Rohan@123",  "name": "Rohan Deshmukh"},
    {"email": "isaaz200623@gmail.com",      "password": "Komal@123",  "name": "Komal Yerkal"},
    {"email": "bhoomitiple@gmail.com",      "password": "Bhoomi@123", "name": "Bhoomi Tiple"},
    {"email": "pranjaljagtap@gmail.com",    "password": "Pranjal@123","name": "Pranjal Jagtap"},
    {"email": "karan.malhotra@example.com", "password": "Karan@123",  "name": "Karan Malhotra"},
    {"email": "ishita.verma@example.com",   "password": "Ishita@123", "name": "Ishita Verma"},
]
# -------------------------------------------------------------------
 
print()
for entry in LOGINS:
    email, password, name = entry["email"], entry["password"], entry["name"]
    try:
        existing = auth.get_user_by_email(email)
        auth.update_user(existing.uid, password=password, display_name=name)
        print(f"reset:   {name:<18} {email:<32} password: {password}")
    except auth.UserNotFoundError:
        auth.create_user(email=email, password=password, display_name=name, email_verified=True)
        print(f"created: {name:<18} {email:<32} password: {password}")
 
print("\nDone. Log in at /login using any of the emails/passwords above.")
