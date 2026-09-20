import { describe, expect, it } from 'vitest';
import {
  getCallIceServers,
  getCommunityRelayIceServers,
  getIceCandidateType,
  hasTurnRelayServer,
} from './callService';

describe('WebRTC ICE configuration', () => {
  it('có nhiều STUN provider và cổng dự phòng cho Wi-Fi hạn chế', () => {
    const servers = getCallIceServers();
    const urls = servers.flatMap((server) => (
      Array.isArray(server.urls) ? server.urls : [server.urls]
    ));

    expect(urls).toContain('stun:stun.cloudflare.com:3478');
    expect(urls).toContain('stun:stun.relay.metered.ca:80');
    expect(urls).toContain('stun:stun.l.google.com:19302');
  });

  it('nhận biết cấu hình có máy chủ TURN', () => {
    expect(hasTurnRelayServer([{ urls: 'stun:stun.cloudflare.com:3478' }])).toBe(false);
    expect(hasTurnRelayServer([{ urls: ['stun:example.com', 'turns:relay.example.com:443'] }])).toBe(true);
  });

  it('có TURN qua TCP/TLS 443 khi relay riêng chưa sẵn sàng', () => {
    const servers = getCommunityRelayIceServers();
    const urls = servers.flatMap((server) => (
      Array.isArray(server.urls) ? server.urls : [server.urls]
    ));

    expect(hasTurnRelayServer(servers)).toBe(true);
    expect(urls).toContain('turn:openrelay.metered.ca:443?transport=tcp');
    expect(urls).toContain('turns:openrelay.metered.ca:443?transport=tcp');
  });

  it('đọc được loại ICE candidate từ chuỗi SDP candidate', () => {
    expect(getIceCandidateType({
      candidate: 'candidate:1 1 udp 1677734910 203.0.113.2 50000 typ srflx raddr 0.0.0.0 rport 0',
    })).toBe('srflx');
    expect(getIceCandidateType({
      candidate: 'candidate:2 1 tcp 1518280447 192.0.2.4 443 typ relay tcptype passive',
    })).toBe('relay');
  });
});
