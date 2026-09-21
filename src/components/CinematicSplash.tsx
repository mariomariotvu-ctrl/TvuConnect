import React from 'react';
import './CinematicSplash.css';

export const CinematicSplash: React.FC = () => (
  <div className="tvu-splash" role="status" aria-live="polite" aria-label="TVU Connect đang khởi động">
    <div className="tvu-splash__sky" aria-hidden="true">
      <span className="tvu-splash__orb tvu-splash__orb--one" />
      <span className="tvu-splash__orb tvu-splash__orb--two" />
      <span className="tvu-splash__spark tvu-splash__spark--one" />
      <span className="tvu-splash__spark tvu-splash__spark--two" />
      <span className="tvu-splash__spark tvu-splash__spark--three" />
    </div>

    <div className="tvu-splash__scene" aria-hidden="true">
      <div className="tvu-splash__mark">
        <span>TVU</span>
      </div>
      <span className="tvu-splash__impact" />
      <span className="tvu-splash__shadow" />
    </div>

    <div className="tvu-splash__copy">
      <strong>TVU Connect</strong>
      <span>Kết nối đúng người, đúng khoảnh khắc</span>
    </div>
    <span className="tvu-splash__loading" aria-hidden="true"><i /></span>
    <span className="sr-only">Đang chuẩn bị không gian của bạn…</span>
  </div>
);
