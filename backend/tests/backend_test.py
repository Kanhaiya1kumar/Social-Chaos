"""
Backend API tests for Social Chaos app
Tests: health endpoint, generate-keyart endpoint, MongoDB storage
"""
import pytest
import requests
import os
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

# Load environment from frontend .env for EXPO_PUBLIC_BACKEND_URL
from pathlib import Path
from dotenv import load_dotenv

frontend_env = Path(__file__).parent.parent.parent / "frontend" / ".env"
if frontend_env.exists():
    load_dotenv(frontend_env)

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL')
if not BASE_URL:
    raise ValueError("EXPO_PUBLIC_BACKEND_URL not set in environment")
BASE_URL = BASE_URL.rstrip('/')

# MongoDB connection for verification
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
async def mongo_client():
    """MongoDB client for verification"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


class TestHealthEndpoint:
    """Health check endpoint tests"""

    def test_health_returns_200(self, api_client):
        """Test GET /api/health returns 200"""
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ Health endpoint returns 200")

    def test_health_response_structure(self, api_client):
        """Test health response has correct structure"""
        response = api_client.get(f"{BASE_URL}/api/health")
        data = response.json()
        
        assert "status" in data, "Missing 'status' field"
        assert data["status"] == "healthy", f"Expected status='healthy', got {data['status']}"
        
        assert "llm_key_configured" in data, "Missing 'llm_key_configured' field"
        assert data["llm_key_configured"] is True, "LLM key should be configured"
        
        assert "time" in data, "Missing 'time' field"
        # Verify time is ISO format
        try:
            datetime.fromisoformat(data["time"].replace('Z', '+00:00'))
            print(f"✓ Health response valid: {data}")
        except ValueError:
            pytest.fail(f"Time field is not valid ISO format: {data['time']}")


class TestGenerateKeyArt:
    """Key art generation endpoint tests"""

    def test_generate_keyart_returns_200(self, api_client):
        """Test POST /api/generate-keyart returns 200"""
        response = api_client.post(
            f"{BASE_URL}/api/generate-keyart",
            json={"variant": "test"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Generate keyart endpoint returns 200")

    def test_generate_keyart_response_structure(self, api_client):
        """Test generate-keyart response has all required fields"""
        response = api_client.post(
            f"{BASE_URL}/api/generate-keyart",
            json={"variant": "test"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check all required fields
        assert "id" in data, "Missing 'id' field"
        assert "image_base64" in data, "Missing 'image_base64' field"
        assert "mime_type" in data, "Missing 'mime_type' field"
        assert "caption" in data, "Missing 'caption' field"
        assert "created_at" in data, "Missing 'created_at' field"
        
        # Verify image_base64 is a data URI with substantial content
        assert data["image_base64"].startswith("data:"), "image_base64 should be a data URI"
        assert ";base64," in data["image_base64"], "image_base64 should contain base64 data"
        assert len(data["image_base64"]) > 5000, f"image_base64 too short: {len(data['image_base64'])} chars"
        
        # Verify mime_type
        assert data["mime_type"] in ["image/png", "image/jpeg", "image/jpg"], f"Unexpected mime_type: {data['mime_type']}"
        
        # Verify caption is not empty
        assert len(data["caption"]) > 0, "Caption should not be empty"
        
        # Verify created_at is ISO format
        try:
            datetime.fromisoformat(data["created_at"].replace('Z', '+00:00'))
        except ValueError:
            pytest.fail(f"created_at is not valid ISO format: {data['created_at']}")
        
        print(f"✓ Generate keyart response valid:")
        print(f"  - id: {data['id']}")
        print(f"  - image_base64 length: {len(data['image_base64'])} chars")
        print(f"  - mime_type: {data['mime_type']}")
        print(f"  - caption: {data['caption'][:50]}...")
        print(f"  - created_at: {data['created_at']}")

    def test_generate_keyart_without_variant(self, api_client):
        """Test generate-keyart works without variant parameter"""
        response = api_client.post(
            f"{BASE_URL}/api/generate-keyart",
            json={}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "image_base64" in data
        print("✓ Generate keyart works without variant")


class TestMongoDBStorage:
    """MongoDB storage verification tests"""

    @pytest.mark.asyncio
    async def test_metadata_stored_without_base64(self):
        """Test that MongoDB stores metadata WITHOUT the full base64 payload"""
        # Connect to MongoDB and verify existing records
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        
        try:
            # Find any existing record
            record = await db.keyart_generations.find_one()
            
            if record is None:
                pytest.skip("No keyart_generations records found in MongoDB (LLM budget may be exhausted)")
            
            # Verify metadata fields are present
            assert "id" in record, "Missing 'id' in MongoDB record"
            assert "mime_type" in record, "Missing 'mime_type' in MongoDB record"
            assert "caption" in record, "Missing 'caption' in MongoDB record"
            assert "created_at" in record, "Missing 'created_at' in MongoDB record"
            
            # CRITICAL: Verify base64 payload is NOT stored
            assert "image_base64" not in record, "ERROR: image_base64 should NOT be stored in MongoDB"
            assert "data" not in record, "ERROR: 'data' field should NOT be stored in MongoDB"
            
            # Check that no field contains large base64 data
            for key, value in record.items():
                if isinstance(value, str) and len(value) > 1000:
                    pytest.fail(f"Field '{key}' contains large data ({len(value)} chars) - possible base64 leak")
            
            print(f"✓ MongoDB storage correct:")
            print(f"  - Record found with id: {record.get('id', 'N/A')}")
            print(f"  - Metadata fields present: id, mime_type, caption, created_at")
            print(f"  - Base64 payload NOT stored (correct)")
            print(f"  - Record size: {len(str(record))} chars")
            
        finally:
            client.close()


class TestErrorHandling:
    """Error handling tests"""

    def test_generate_keyart_error_handling(self, api_client):
        """Test that LLM failures return graceful JSON error (if key works, this is informational)"""
        # This test is informational - we expect the key to work
        # If it fails, we just verify the error is graceful
        response = api_client.post(
            f"{BASE_URL}/api/generate-keyart",
            json={"variant": "test"}
        )
        
        if response.status_code != 200:
            # Verify error response is JSON
            try:
                error_data = response.json()
                assert "detail" in error_data, "Error response should have 'detail' field"
                print(f"⚠ LLM call failed (expected if key invalid): {error_data}")
            except ValueError:
                pytest.fail("Error response is not valid JSON")
        else:
            print("✓ LLM integration working correctly")
