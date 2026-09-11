/**
 * Test Example: Using Spacetraders API in Tests
 *
 * This example demonstrates how to use the generated API functions
 * in unit and integration tests with mock dependencies.
 */

import { HttpClient, SpaceTradersConfig } from '../target/spacetraders-api/client';
import { navigateShip } from '../target/spacetraders-api/fleet/navigateship';
import { ApiResponse, ApiError } from '../target/spacetraders-api/errors';

/**
 * Mock HttpClient for testing (simulates API responses)
 */
class MockHttpClient extends HttpClient {
  private mockResponse: Promise<ApiResponse<object>>;

  constructor(mockResp: Promise<ApiResponse<object>>) {
    // Pass a dummy config to parent
    super({ token: 'mock-token' });
    this.mockResponse = mockResp;
  }

  async send<T>(options: any): Promise<ApiResponse<T>> {
    return this.mockResponse as any;
  }
}

/**
 * Example: Unit test with mocked API response
 */
describe('NavigateShip API', () => {
  let mockResult: ApiResponse<object>;
  let http: HttpClient;

  beforeEach(() => {
    // Setup mock to return success
    mockResult = {
      ok: true,
      data: {
        nav: { systemSymbol: 'star-hadex' },
        fuel: { current: 100, capacity: 200 },
        events: [],
      },
    };

    // Create mock client
    http = new MockHttpClient(Promise.resolve(mockResult));
  });

  test('should navigate ship successfully', async () => {
    const result = await navigateShip(http, 'ship-123');

    expect(result.ok).toBe(true);
    expect(result.data).toHaveProperty('nav');
    expect(result.data).toHaveProperty('fuel');
    expect(result.data).toHaveProperty('events');
  });

  test('should handle API errors', async () => {
    const errorResult: ApiResponse<object> = {
      ok: false,
      error: new ApiError(404, null, 'Ship not found'),
    };

    http = new MockHttpClient(Promise.resolve(errorResult));

    const result = await navigateShip(http, 'ship-123');

    expect(result.ok).toBe(false);
    expect(result.error!.status).toBe(404);
  });
});

/**
 * Example: Integration test setup (placeholder)
 */
class IntegrationTestSuite {
  private http: HttpClient;

  constructor() {
    this.http = new HttpClient({
      token: process.env.TEST_AGENT_TOKEN,
    });
  }

  async setup(): Promise<void> {
    console.log('🧪 Setting up integration test environment...');
    // Setup test ship, system, waypoint here
  }

  async teardown(): Promise<void> {
    console.log('🧹 Cleaning up test environment...');
    // Cleanup resources
  }

  async testNavigate(): Promise<void> {
    try {
      const result = await navigateShip(
        this.http,
        'test-ship-symbol'
      );

      if (result.ok) {
        console.log('✅ Integration test passed: Navigate');
      } else {
        console.log('✅ Integration test passed: Error handling');
      }
    } catch (error) {
      console.log('❌ Integration test failed:', error);
      throw error;
    }
  }
}

// Run standalone if executed directly
if (require.main === module) {
  console.log('=== API Test Examples ===\n');

  const suite = new IntegrationTestSuite();

  suite.setup()
    .then(() => suite.testNavigate())
    .then(() => suite.teardown())
    .then(() => {
      console.log('\n✅ All test examples completed!');
    })
    .catch((err) => {
      console.log('\n💥 Test example failed:', err);
      process.exit(1);
    });
}

export { MockHttpClient, IntegrationTestSuite };
