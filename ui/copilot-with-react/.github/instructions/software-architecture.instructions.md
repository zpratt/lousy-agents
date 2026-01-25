---
applyTo: "src/**/*.{ts,tsx}"
---

# Clean Architecture Instructions for SPA

## The Dependency Rule

Dependencies point inward only. Outer layers depend on inner layers, never the reverse.

**Layers (innermost to outermost):**
1. Entities — Enterprise business rules
2. Use Cases — Application business rules
3. Adapters — Interface converters (gateways, components)
4. Infrastructure — Frameworks, drivers, composition root

## Directory Structure

```
src/
├── entities/                  # Layer 1: Business domain entities
├── use-cases/                 # Layer 2: Application business rules
├── gateways/                  # Layer 3: Backend-for-Frontend (BFF) API adapters
├── app/                       # Layer 4: Next.js App Router (pages, layouts)
│   ├── api/                   # BFF API routes (proxy to backend services)
│   ├── (routes)/              # Page routes
│   └── layout.tsx             # Root layout
├── components/                # Layer 3: React components (UI adapters)
│   ├── ui/                    # Primitive UI components
│   └── features/              # Feature-specific components
├── hooks/                     # Layer 3: React hooks for data fetching
└── lib/                       # Layer 3: Configuration and utilities
```

## Layer 1: Entities

**Location:** `src/entities/`

- MUST NOT import from any other layer
- MUST NOT depend on frameworks or infrastructure
- MUST NOT use non-deterministic or side-effect-producing global APIs (e.g., `crypto.randomUUID()`, `Date.now()`, `Math.random()`)
- MAY use pure, deterministic global APIs (e.g., `Intl.NumberFormat`, `parseInt()`, `JSON.parse()`)
- MUST be plain TypeScript objects/classes with business logic
- MAY contain validation and business rules

```typescript
// src/entities/product.ts
export interface Product {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly inStock: boolean;
}

export function isAvailableForPurchase(product: Product): boolean {
  return product.inStock && product.price > 0;
}

export function formatPrice(product: Product): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(product.price);
}
```

**Violations:**
- Importing React, Next.js, or any framework
- Importing from `src/use-cases/`, `src/gateways/`, `src/components/`, or `src/lib/`
- HTTP calls or API operations
- Using non-deterministic global APIs like `crypto.randomUUID()`, `Date.now()`, or `Math.random()`

## Layer 2: Use Cases

**Location:** `src/use-cases/`

- MUST only import from entities and ports (interfaces)
- MUST define input/output DTOs
- MUST define ports for external dependencies
- MUST NOT import concrete implementations

```typescript
// src/use-cases/get-products.ts
import type { Product } from '../entities/product';

export interface GetProductsInput {
  category?: string;
  limit?: number;
}

export interface GetProductsOutput {
  products: Product[];
  total: number;
}

// Port - interface for the API gateway
export interface ProductApiGateway {
  fetchProducts(category?: string, limit?: number): Promise<{ products: Product[]; total: number }>;
}

export class GetProductsUseCase {
  constructor(private readonly productApi: ProductApiGateway) {}

  async execute(input: GetProductsInput): Promise<GetProductsOutput> {
    const { products, total } = await this.productApi.fetchProducts(
      input.category,
      input.limit
    );

    return { products, total };
  }
}
```

**Violations:**
- Importing React, Next.js, or any framework
- Importing from `gateways/`, `components/`, or `lib/`
- Making HTTP calls directly

## Layer 3: Adapters

**Location:** `src/gateways/`, `src/components/`, `src/hooks/`, and `src/lib/`

### Gateways (Backend-for-Frontend API Adapters)

Gateways act as the BFF layer, calling your backend API routes and transforming data for the frontend.

```typescript
// src/gateways/product-api-gateway.ts
import { z } from 'zod';
import type { Product } from '@/entities/product';
import type { ProductApiGateway } from '@/use-cases/get-products';

// Schema for runtime validation of API responses
const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
  inStock: z.boolean(),
});

const ProductsResponseSchema = z.object({
  products: z.array(ProductSchema),
  total: z.number(),
});

export function createProductApiGateway(baseUrl: string): ProductApiGateway {
  return {
    async fetchProducts(
      category?: string,
      limit?: number
    ): Promise<{ products: Product[]; total: number }> {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (limit) params.set('limit', String(limit));

      const response = await fetch(`${baseUrl}/api/products?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch products: ${response.status}`);
      }

      const data: unknown = await response.json();
      return ProductsResponseSchema.parse(data);
    },
  };
}
```

### React Hooks (Data Fetching Adapters)

Hooks wire use cases to React components and manage loading/error states. Use factory functions to enable testing with different implementations.

```typescript
// src/hooks/use-products.ts
'use client';

import { useState, useEffect } from 'react';
import type { Product } from '@/entities/product';
import type { GetProductsUseCase } from '@/use-cases/get-products';

interface UseProductsDeps {
  getProductsUseCase: GetProductsUseCase;
}

// Factory to create a hook with injected dependencies
export function createUseProductsHook({ getProductsUseCase }: UseProductsDeps) {
  return function useProducts(category?: string) {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
      setLoading(true);
      getProductsUseCase
        .execute({ category })
        .then(({ products }) => setProducts(products))
        .catch(setError)
        .finally(() => setLoading(false));
    }, [category]);

    return { products, loading, error };
  };
}

// src/hooks/index.ts - Composition root for hooks
import { GetProductsUseCase } from '@/use-cases/get-products';
import { createProductApiGateway } from '@/gateways/product-api-gateway';
import { createUseProductsHook } from './use-products';

const productApi = createProductApiGateway('');
const getProductsUseCase = new GetProductsUseCase(productApi);

// Export the fully-wired hook for use in components
export const useProducts = createUseProductsHook({ getProductsUseCase });
```

### React Components (UI Adapters)

Components receive data as props and focus purely on presentation.

```typescript
// src/components/features/product-list.tsx
'use client';

import type { Product } from '@/entities/product';
import { formatPrice, isAvailableForPurchase } from '@/entities/product';

interface ProductListProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
}

export function ProductList({ products, onAddToCart }: ProductListProps) {
  return (
    <ul>
      {products.map((product) => (
        <li key={product.id}>
          <span>{product.name}</span>
          <span>{formatPrice(product)}</span>
          <button
            onClick={() => onAddToCart(product)}
            disabled={!isAvailableForPurchase(product)}
          >
            Add to Cart
          </button>
        </li>
      ))}
    </ul>
  );
}
```

**Violations:**
- Business logic (validation rules, pricing calculations)
- Domain decisions that should be in entities or use cases
- Direct API calls in components (use hooks instead)

## Layer 4: Infrastructure

**Location:** `src/app/` (Next.js App Router)

The BFF API routes act as a proxy layer between your SPA and backend services.

```typescript
// src/app/api/products/route.ts
import { NextResponse } from 'next/server';

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'https://api.example.com';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const limit = searchParams.get('limit');

  try {
    // Proxy to backend service
    const backendUrl = new URL('/v1/products', BACKEND_API_URL);
    if (category) backendUrl.searchParams.set('category', category);
    if (limit) backendUrl.searchParams.set('limit', limit);

    const response = await fetch(backendUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${process.env.BACKEND_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

### Page Components (Composition Root)

Pages wire together hooks and components.

```typescript
// src/app/products/page.tsx
'use client';

import { useProducts } from '@/hooks/use-products';
import { ProductList } from '@/components/features/product-list';
import type { Product } from '@/entities/product';

export default function ProductsPage() {
  const { products, loading, error } = useProducts();

  const handleAddToCart = (product: Product) => {
    // Handle add to cart action
    console.log('Added to cart:', product.name);
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <ProductList products={products} onAddToCart={handleAddToCart} />;
}
```

## Dependency Injection Patterns

### Factory Functions (Preferred for SPA)

Factory functions create gateway instances with injected configuration.

```typescript
// ✅ Good - Factory function with dependency injection
export function createProductApiGateway(baseUrl: string): ProductApiGateway {
  return {
    async fetchProducts(category?: string): Promise<{ products: Product[] }> {
      const response = await fetch(`${baseUrl}/api/products`);
      return response.json();
    },
  };
}

// Usage in tests
const mockGateway = createProductApiGateway('http://mock-api');

// ❌ Bad - Hardcoded URL (hard to test)
export const productApiGateway: ProductApiGateway = {
  async fetchProducts(): Promise<{ products: Product[] }> {
    const response = await fetch('/api/products'); // Hardcoded
    return response.json();
  },
};
```

### Constructor Injection for Classes

Use constructor injection when classes are preferred.

```typescript
// ✅ Good - Constructor injection
export class GetProductsUseCase {
  constructor(private readonly productApi: ProductApiGateway) {}

  async execute(input: GetProductsInput): Promise<GetProductsOutput> {
    return this.productApi.fetchProducts(input.category);
  }
}
```

## Import Rules Summary

| From | Entities | Use Cases | Gateways/Hooks/Components | App (Infrastructure) |
|------|----------|-----------|---------------------------|---------------------|
| Entities | ✓ | ✗ | ✗ | ✗ |
| Use Cases | ✓ | ✓ | ✗ | ✗ |
| Gateways/Hooks/Components | ✓ | ✓ | ✓ | ✗ |
| App (Infrastructure) | ✓ | ✓ | ✓ | ✓ |

## Anti-Patterns

**Anemic Domain Model:** Entities as data-only containers with logic in services. Put business rules in entities.

**Leaky Abstractions:** Gateways exposing fetch Response objects. Return domain types only.

**Business Logic in Components:** Authorization checks or validation in React components. Move to entities/use cases.

**Direct API Calls in Components:** Components making fetch calls directly. Use hooks or gateways.

## Code Review Checklist

- Entities have zero imports from other layers
- Use cases define ports for all external dependencies
- Gateways implement ports and handle API communication
- Hooks wire use cases to React lifecycle
- Components receive data as props, focus on presentation
- API routes act as BFF proxy layer
- Use cases testable with simple mocks (no HTTP)
