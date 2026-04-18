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



# ---------- NEW: Score/Leaderboard Tests ----------
class TestScoreEndpoints:
    """Score submission and leaderboard endpoint tests"""

    def test_submit_score_returns_200(self, api_client):
        """Test POST /api/scores returns 200 with valid data"""
        response = api_client.post(
            f"{BASE_URL}/api/scores",
            json={"player_name": "TESTER", "score": 999}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Submit score endpoint returns 200")

    def test_submit_score_response_structure(self, api_client):
        """Test POST /api/scores returns correct structure with id, player_name, score, created_at"""
        response = api_client.post(
            f"{BASE_URL}/api/scores",
            json={"player_name": "TEST_PLAYER", "score": 1234}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check all required fields
        assert "id" in data, "Missing 'id' field"
        assert "player_name" in data, "Missing 'player_name' field"
        assert "score" in data, "Missing 'score' field"
        assert "created_at" in data, "Missing 'created_at' field"
        
        # Verify player_name is uppercased
        assert data["player_name"] == "TEST_PLAYER", f"Expected 'TEST_PLAYER', got {data['player_name']}"
        
        # Verify score matches
        assert data["score"] == 1234, f"Expected score 1234, got {data['score']}"
        
        # Verify created_at is ISO format
        try:
            datetime.fromisoformat(data["created_at"].replace('Z', '+00:00'))
        except ValueError:
            pytest.fail(f"created_at is not valid ISO format: {data['created_at']}")
        
        print(f"✓ Submit score response valid:")
        print(f"  - id: {data['id']}")
        print(f"  - player_name: {data['player_name']}")
        print(f"  - score: {data['score']}")
        print(f"  - created_at: {data['created_at']}")

    def test_submit_score_name_uppercased(self, api_client):
        """Test that player_name is uppercased"""
        response = api_client.post(
            f"{BASE_URL}/api/scores",
            json={"player_name": "lowercase", "score": 100}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["player_name"] == "LOWERCASE", f"Expected 'LOWERCASE', got {data['player_name']}"
        print("✓ Player name correctly uppercased")

    def test_submit_score_name_trimmed_to_12_chars(self, api_client):
        """Test that player_name is trimmed to 12 characters"""
        long_name = "VERYLONGPLAYERNAME123456"
        response = api_client.post(
            f"{BASE_URL}/api/scores",
            json={"player_name": long_name, "score": 200}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["player_name"]) <= 12, f"Name should be max 12 chars, got {len(data['player_name'])}"
        assert data["player_name"] == long_name[:12], f"Expected '{long_name[:12]}', got {data['player_name']}"
        print(f"✓ Long name trimmed to 12 chars: {data['player_name']}")

    def test_submit_score_empty_name_becomes_anon(self, api_client):
        """Test that empty player_name becomes 'ANON'"""
        response = api_client.post(
            f"{BASE_URL}/api/scores",
            json={"player_name": "", "score": 300}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["player_name"] == "ANON", f"Expected 'ANON', got {data['player_name']}"
        print("✓ Empty name correctly becomes 'ANON'")

    def test_submit_score_whitespace_name_becomes_anon(self, api_client):
        """Test that whitespace-only player_name becomes 'ANON'"""
        response = api_client.post(
            f"{BASE_URL}/api/scores",
            json={"player_name": "   ", "score": 400}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["player_name"] == "ANON", f"Expected 'ANON', got {data['player_name']}"
        print("✓ Whitespace name correctly becomes 'ANON'")

    def test_get_top_scores_returns_200(self, api_client):
        """Test GET /api/scores/top returns 200"""
        response = api_client.get(f"{BASE_URL}/api/scores/top?limit=10")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Get top scores endpoint returns 200")

    def test_get_top_scores_response_structure(self, api_client):
        """Test GET /api/scores/top returns {scores: [...]} with correct structure"""
        # First submit a test score to ensure we have data
        api_client.post(
            f"{BASE_URL}/api/scores",
            json={"player_name": "TEST_TOP", "score": 5000}
        )
        
        response = api_client.get(f"{BASE_URL}/api/scores/top?limit=10")
        assert response.status_code == 200
        data = response.json()
        
        # Check structure
        assert "scores" in data, "Missing 'scores' field"
        assert isinstance(data["scores"], list), "scores should be a list"
        
        if len(data["scores"]) > 0:
            # Verify first entry has correct fields
            entry = data["scores"][0]
            assert "id" in entry, "Score entry missing 'id'"
            assert "player_name" in entry, "Score entry missing 'player_name'"
            assert "score" in entry, "Score entry missing 'score'"
            assert "created_at" in entry, "Score entry missing 'created_at'"
            
            print(f"✓ Get top scores response valid:")
            print(f"  - Total scores: {len(data['scores'])}")
            print(f"  - Top score: {entry['player_name']} - {entry['score']}")
        else:
            print("✓ Get top scores response valid (empty list)")

    def test_get_top_scores_sorted_descending(self, api_client):
        """Test that scores are sorted in descending order"""
        # Submit multiple test scores
        test_scores = [
            {"player_name": "TEST_LOW", "score": 100},
            {"player_name": "TEST_HIGH", "score": 9999},
            {"player_name": "TEST_MID", "score": 500},
        ]
        for score_data in test_scores:
            api_client.post(f"{BASE_URL}/api/scores", json=score_data)
        
        response = api_client.get(f"{BASE_URL}/api/scores/top?limit=10")
        assert response.status_code == 200
        data = response.json()
        
        scores = data["scores"]
        if len(scores) > 1:
            # Verify descending order
            for i in range(len(scores) - 1):
                assert scores[i]["score"] >= scores[i + 1]["score"], \
                    f"Scores not in descending order: {scores[i]['score']} < {scores[i + 1]['score']}"
            print(f"✓ Scores correctly sorted descending: {[s['score'] for s in scores[:5]]}")
        else:
            print("✓ Not enough scores to verify sorting")

    def test_get_top_scores_limit_parameter(self, api_client):
        """Test that limit parameter works correctly"""
        response = api_client.get(f"{BASE_URL}/api/scores/top?limit=5")
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["scores"]) <= 5, f"Expected max 5 scores, got {len(data['scores'])}"
        print(f"✓ Limit parameter works: returned {len(data['scores'])} scores (max 5)")

    @pytest.mark.asyncio
    async def test_score_persisted_in_mongodb(self, api_client):
        """Test that submitted scores are actually persisted in MongoDB"""
        # Submit a unique test score
        test_name = f"TEST_PERSIST_{datetime.now().timestamp()}"
        test_score = 7777
        
        response = api_client.post(
            f"{BASE_URL}/api/scores",
            json={"player_name": test_name, "score": test_score}
        )
        assert response.status_code == 200
        created_id = response.json()["id"]
        
        # Verify in MongoDB
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        
        try:
            record = await db.scores.find_one({"id": created_id})
            assert record is not None, f"Score with id {created_id} not found in MongoDB"
            assert record["player_name"] == test_name[:12].upper(), f"Name mismatch in MongoDB"
            assert record["score"] == test_score, f"Score mismatch in MongoDB"
            
            print(f"✓ Score persisted in MongoDB:")
            print(f"  - id: {record['id']}")
            print(f"  - player_name: {record['player_name']}")
            print(f"  - score: {record['score']}")
        finally:
            client.close()
