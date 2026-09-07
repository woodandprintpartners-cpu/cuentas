import os
import zipfile

def create_cloud_zip():
    base_dir = os.path.dirname(__file__)
    zip_path = os.path.join(base_dir, "wp_workshop_cloud.zip")
    
    ignore_patterns = [
        "__pycache__", ".git", ".db", ".xlsx", "test_app.py",
        "wp_workshop_cloud.zip", "test_crud.py", ".pyc"
    ]
    
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(base_dir):
            dirs[:] = [d for d in dirs if not any(p in d for p in ["__pycache__", ".git"])]
            for file in files:
                if any(p in file for p in ignore_patterns):
                    continue
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, base_dir)
                zf.write(file_path, rel_path)
                print(f"Adding {rel_path}...")

    print(f"\n[OK] Archivo ZIP para la nube creado con éxito: {zip_path}")

if __name__ == "__main__":
    create_cloud_zip()
