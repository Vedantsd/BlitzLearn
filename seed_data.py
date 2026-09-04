
import os
import json
import random
import psycopg2
import psycopg2.extras
from werkzeug.security import generate_password_hash
from dotenv import load_dotenv
 
load_dotenv()
 
 
def get_db():
    return psycopg2.connect(os.getenv("DATABASE_URL"), cursor_factory=psycopg2.extras.RealDictCursor)
 
 
TRAINERS = [
    {"username": "trainer_it",   "password": "trainer123", "name": "Santosh warpe",  "department": "Information Technology"},
    {"username": "trainer_fin",  "password": "trainer123", "name": "Shivaji Patil",  "department": "Finance"},
    {"username": "trainer_mgmt", "password": "trainer123", "name": "Parwati Bhadre", "department": "Management"},
]
 
USERS = [
    {
        "uid": "user_001", "name": "Rohan Deshmukh", "age": 27, "phone": "9876500001",
        "email": "rohan.deshmukh@example.com", "department": "Information Technology",
        "designation": "Junior Analyst",
        "skills": {"Python": (17, 20), "Management": (12, 20), "Finance": (10, 15)},
    },
    {
        "uid": "user_002", "name": "Komal Yerkal", "age": 29, "phone": "7020014190",
        "email": "isaaz200623@gmail.com", "department": "Information Technology",
        "designation": "Data Analyst",
        "skills": {"Python": (19, 20), "Management": (15, 20), "Finance": (8, 15)},
    },
    {
        "uid": "user_003", "name": "Bhoomi Tiple", "age": 31, "phone": "8983600646",
        "email": "bhoomitiple@gmail.com", "department": "Finance",
        "designation": "Finance Officer",
        "skills": {"Finance": (18, 20), "Management": (14, 20), "Python": (6, 15)},
    },
    {
        "uid": "user_004", "name": "Pranjal Jagtap", "age": 26, "phone": "8788253129",
        "email": "pranjaljagtap@gmail.com", "department": "Finance",
        "designation": "Budget Analyst",
        "skills": {"Finance": (16, 20), "Management": (11, 20), "Python": (9, 15)},
    },
    {
        "uid": "user_005", "name": "Karan Malhotra", "age": 33, "phone": "9876500005",
        "email": "karan.malhotra@example.com", "department": "Management",
        "designation": "Team Lead",
        "skills": {"Management": (18, 20), "Finance": (12, 20), "Python": (7, 15)},
    },
    {
        "uid": "user_006", "name": "Ishita Verma", "age": 24, "phone": "9876500006",
        "email": "ishita.verma@example.com", "department": "Management",
        "designation": "Trainee Officer",
        "skills": {"Management": (13, 20), "Finance": (9, 20), "Python": (11, 15)},
    },
]
 
 
def seed_trainers(cur):
    print("\n--- Trainers ---")
    for t in TRAINERS:
        cur.execute("SELECT id FROM trainers WHERE LOWER(username) = LOWER(%s)", (t["username"],))
        existing = cur.fetchone()
        if existing:
            cur.execute(
                "UPDATE trainers SET name = %s, department = %s WHERE id = %s",
                (t["name"], t["department"], existing["id"])
            )
            print(f"  updated: {t['username']} -> {t['name']} ({t['department']})")
        else:
            cur.execute(
                """INSERT INTO trainers (username, password_hash, name, department)
                   VALUES (%s, %s, %s, %s)""",
                (t["username"], generate_password_hash(t["password"]), t["name"], t["department"])
            )
            print(f"  added: {t['username']} / {t['password']}  ({t['department']})")
 
 
def seed_users_and_scores(cur):
    print("\n--- Users ---")
    for u in USERS:
        cur.execute("SELECT id FROM users WHERE uid = %s", (u["uid"],))
        existing = cur.fetchone()
        if existing:
            user_id = existing["id"]
            cur.execute(
                """UPDATE users SET name = %s, age = %s, phone = %s, email = %s,
                       department = %s, designation = %s
                   WHERE id = %s""",
                (u["name"], u["age"], u["phone"], u["email"], u["department"], u["designation"], user_id)
            )
            print(f"  updated: {u['name']} -> id {user_id} ({u['department']})")
        else:
            cur.execute(
                """INSERT INTO users (uid, name, age, phone, email, department, designation, status)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, 'active') RETURNING id""",
                (u["uid"], u["name"], u["age"], u["phone"], u["email"], u["department"], u["designation"])
            )
            user_id = cur.fetchone()["id"]
            print(f"  added: {u['name']} -> id {user_id} ({u['department']})")
 
        # --- skill_competency rows (drives the progress bars) ---
        overall_correct, overall_total = 0, 0
        skills_breakdown = []
        for skill, (correct, total) in u["skills"].items():
            cur.execute(
                """INSERT INTO skill_competency (user_id, skill_name, correct_count, total_count)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (user_id, skill_name)
                   DO UPDATE SET correct_count = EXCLUDED.correct_count,
                                 total_count = EXCLUDED.total_count""",
                (user_id, skill, correct, total)
            )
            percent = round((correct / total) * 100) if total else 0
            skills_breakdown.append({
                "skill": skill, "correct": correct, "total": total,
                "percent": percent, "level": "Proficient" if percent >= 70 else "Developing"
            })
            overall_correct += correct
            overall_total += total
 
        # --- a test + attempt + skill_report so "Test History" isn't empty ---
        # (only added the first time — re-running an update won't duplicate test history)
        cur.execute("SELECT id FROM tests WHERE user_id = %s AND source_title = 'Initial Skill Assessment'", (user_id,))
        if cur.fetchone():
            continue
 
        cur.execute(
            """INSERT INTO tests (difficulty, num_questions, source_title, user_id, competency_applied)
               VALUES (%s, %s, %s, %s, 1) RETURNING id""",
            ("Mixed", overall_total, "Initial Skill Assessment", user_id)
        )
        test_id = cur.fetchone()["id"]
 
        cur.execute(
            "INSERT INTO test_attempts (test_id, score, total, user_id) VALUES (%s, %s, %s, %s)",
            (test_id, overall_correct, overall_total, user_id)
        )
 
        cur.execute(
            """INSERT INTO skill_reports (user_id, test_id, overall_score, overall_total, skills_breakdown)
               VALUES (%s, %s, %s, %s, %s)""",
            (user_id, test_id, overall_correct, overall_total, json.dumps(skills_breakdown))
        )
 
 
def main():
    conn = get_db()
    cur = conn.cursor()
    try:
        seed_trainers(cur)
        seed_users_and_scores(cur)
        conn.commit()
        print("\nDone. Sample data committed.")
    except Exception as e:
        conn.rollback()
        print(f"\nFailed, rolled back: {e}")
        raise
    finally:
        cur.close()
        conn.close()
 
 
if __name__ == "__main__":
    main()
