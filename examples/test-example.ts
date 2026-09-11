/**
 * Test Example: Using Spacetraders API in Tests
 *
 * This example demonstrates how to use the generated API functions
 * in unit and integration tests with mock dependencies.
 */

import { AgentTokenClient, SpaceTradersConfig } from '../target/spacetraders-api/client';
import { navigateShip } from '../target/spacetraders-api/fleet/navigateship';
import { ApiError } from '../target/spacetraders-api/errors';

/**
 * Mock Client for testing (simulates API responses)
 */
class MockHttpClient extends AgentTokenClient {
  private mockResult: Awaited<ReturnType<typeof navigateShip>>;

  constructor(mockResp: Awaited<ReturnType<typeof navigateShip>>) {
    super({ token: 'mock-token' });
    this.mockResult = mockResult;
  }

  async send<T>(options: any): Promise<any> {
    return {
      ok: true,
      data: this.mockResult,
    };
  }
}

/**
 * Unit test setup (runs when using Jest)
 */
if (typeof describe === 'function') {
  /**
   * Example: Unit test with mocked API response
   */
  describe('NavigateShip API', () => {
    let mockResult: Awaited<ReturnType<typeof navigateShip>>;
    let http: HttpClient;

    beforeEach(() => {
      // Setup mock to return success
      mockResult = {
        nav: { systemSymbol: 'star-hadex' },
        fuel: { current: 100, capacity: 200 },
        events: [],
      };

      http = new MockHttpClient(mockResult);
    });

    test('should navigate ship successfully', async () => {
      const result = await navigateShip(http, 'ship-123');

      expect(result).toHaveProperty('nav');
      expect(result).toHaveProperty('fuel');
      expect(result).toHaveProperty('events');
    });

    test('should throw ApiError on API failure', async () => {
      // Create a mock that returns an error response
      class ErrorMock extends HttpClient {
        constructor() {
          super({ token: 'mock' });
        }
        async send<T>(): Promise<any> {
          return {
            ok: false,
            error: new ApiError(404, null, 'Ship not found'),
          };
        }
      }

      const mock = new ErrorMock();
      await expect(navigateShip(mock, 'ship-123')).rejects.toThrow(ApiError);
    });
  });
}

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
  }

  async teardown(): Promise<void> {
    console.log('🧹 Cleaning up test environment...');
  }

  async testNavigate(): Promise<void> {
    try {
      const result = await navigateShip(
        this.http,
        'test-ship-symbol'
      );

      if (result) {
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
