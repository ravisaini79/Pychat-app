from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "aichat"
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    SMTP_EMAIL: str = ""
    SMTP_PASSWORD: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
