import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AIMessageContent } from './AIMessageContent';

describe('AIMessageContent', () => {
  it('renders headings, lists, emphasis and math instead of exposing markdown syntax', () => {
    const { container } = render(
      <AIMessageContent
        content={`### 2. Công thức

$$\\mathbf{I = \\frac{U}{R}}$$

Trong đó:

* **$I$**: Cường độ dòng điện
* **$U$**: Hiệu điện thế
* **$R$**: Điện trở ($\\Omega$)`}
      />
    );

    expect(screen.getByRole('heading', { level: 3, name: '2. Công thức' })).toBeInTheDocument();
    expect(container.querySelector('.katex-display')).toBeInTheDocument();
    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(container.querySelectorAll('strong')).toHaveLength(3);
  });

  it('does not render raw HTML returned by the model', () => {
    const { container } = render(
      <AIMessageContent content={'Nội dung an toàn <script>window.alert("x")</script>'} />
    );

    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(screen.getByText(/Nội dung an toàn/)).toBeInTheDocument();
  });
});
