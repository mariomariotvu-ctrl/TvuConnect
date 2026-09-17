import React from 'react';
import type { User } from 'firebase/auth';
import { BookOpen, MapPin, Users } from 'lucide-react';
import { Auth } from './Auth';
import { Logo } from './Logo';

interface LandingPageProps {
  user: User | null;
  loading: boolean;
}

const benefits = [
  { icon: Users, title: 'Kết nối đúng người', description: 'Tìm bạn cùng ngành, cùng lớp hoặc ở gần bạn.' },
  { icon: BookOpen, title: 'Học tập tập trung', description: 'Tài liệu, nhóm học và cuộc gọi trong cùng một nơi.' },
  { icon: MapPin, title: 'Khám phá Trà Vinh', description: 'Tìm trọ và quán ăn theo vị trí, có đánh giá cộng đồng.' },
];

export const LandingPage: React.FC<LandingPageProps> = ({ user, loading }) => (
  <section className="auth-landing" aria-labelledby="landing-title">
    <div className="auth-landing__content">
      <Logo size="lg" />
      <div className="auth-landing__copy">
        <p className="auth-landing__eyebrow">Dành cho sinh viên Đại học Trà Vinh</p>
        <h1 id="landing-title">Kết nối, học tập và sống thuận tiện hơn.</h1>
        <p>
          Một không gian rõ ràng để tìm bạn, trò chuyện, học nhóm và khám phá các tiện ích gần trường.
        </p>
      </div>
      <Auth user={user} loading={loading} />
      <p className="auth-landing__privacy">Đăng nhập bằng tài khoản Google. Bạn luôn kiểm soát thông tin được chia sẻ.</p>
    </div>

    <div className="auth-landing__benefits" aria-label="Tính năng chính">
      {benefits.map(({ icon: Icon, title, description }) => (
        <article key={title}>
          <span className="auth-landing__benefit-icon"><Icon aria-hidden="true" /></span>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </article>
      ))}
    </div>
  </section>
);
