/**
 * WebRTC Signaling & Media SDK Wrapper for Alov.uz Live Streaming
 * Uses Socket.io rooms (`stream_${streamId}`) for real-time SDP & ICE candidate exchange.
 */
import { getApiUrl, getBaseUrl } from '../config/api';
import { io, Socket } from 'socket.io-client';
import type { StreamChatMessage } from '../utils/liveStream';
import { resolveRealtimeBackendUrl } from '../utils/microFrontendBridge';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

export interface LiveStreamData {
  id: string;
  hostUid: string;
  hostName: string;
  hostAvatar?: string;
  title: string;
  status: 'active' | 'ended';
  viewerCount: number;
  createdAt?: string;
}

export type LiveChatMessage = StreamChatMessage;

export interface LiveMediaSdkToken {
  provider: 'livekit' | 'agora';
  token: string;
  serverUrl?: string;
  appId?: string;
  channelName?: string;
}

/**
 * Clean SDK wrapper ready for LiveKit / Agora API keys configured on the backend.
 */
export async function requestLiveMediaToken(
  provider: 'livekit' | 'agora',
  streamId: string,
  participantName: string,
  role: 'publisher' | 'subscriber'
): Promise<LiveMediaSdkToken | null> {
  try {
    const endpoint =
      provider === 'livekit' ? '/api/livekit/get-token' : '/api/agora/get-token';
    const res = await fetch(getApiUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomName: `stream_${streamId}`,
        channelName: `stream_${streamId}`,
        participantName,
        role,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.token) return null;
    return {
      provider,
      token: data.token,
      serverUrl: data.serverUrl,
      appId: data.appId,
      channelName: `stream_${streamId}`,
    };
  } catch {
    return null;
  }
}

/**
 * Start a live stream session as Host
 */
export async function createLiveStream(
  hostUser: { uid: string; name: string; avatar?: string },
  title: string,
  backendOrigin?: string
): Promise<string> {
  const streamId = `live_${hostUser.uid}_${Date.now()}`;
  const targetUrl = backendOrigin
    ? `${resolveRealtimeBackendUrl(backendOrigin)}/api/live-streams/start`
    : `${resolveRealtimeBackendUrl(getBaseUrl())}/api/live-streams/start`;
  try {
    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        streamId,
        hostUid: hostUser.uid,
        hostName: hostUser.name || 'Alov Strimer',
        hostAvatar: hostUser.avatar || '',
        title: title || 'Jonli Efir 🔥',
      }),
    });
  } catch (err) {
    console.error('Error creating live stream:', err);
  }
  return streamId;
}

/**
 * Stop live stream session as Host
 */
export async function stopLiveStream(streamId: string, hostUid: string, backendOrigin?: string) {
  const targetUrl = backendOrigin
    ? `${resolveRealtimeBackendUrl(backendOrigin)}/api/live-streams/stop`
    : `${resolveRealtimeBackendUrl(getBaseUrl())}/api/live-streams/stop`;
  try {
    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streamId, hostUid }),
    });
  } catch (err) {
    console.error('Error stopping live stream:', err);
  }
}

function createSignalingSocket(backendOrigin?: string): Socket {
  const signalingOrigin = resolveRealtimeBackendUrl(backendOrigin || getBaseUrl());
  return io(signalingOrigin, {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 12,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });
}

/**
 * Host WebRTC Manager: Listens for incoming viewer offers via Socket.io (`offer`, `answer`, `ice-candidate`)
 * and streams host camera/mic to all viewers. Supports live track replacement when flipping front/back camera.
 */
export class BroadcasterSignaling {
  private streamId: string;
  private hostUid: string;
  private localStream: MediaStream;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private socket: Socket;
  private ownsSocket: boolean;
  private onOfferBound?: (payload: any) => void;
  private onCandidateBound?: (payload: any) => void;

  constructor(
    streamId: string,
    localStream: MediaStream,
    socket?: Socket,
    hostUid?: string
  ) {
    this.streamId = streamId;
    this.localStream = localStream;
    this.hostUid = hostUid || '';
    this.ownsSocket = !socket;
    this.socket = socket || createSignalingSocket();
  }

  public startListening() {
    this.socket.emit('join_stream', {
      streamId: this.streamId,
      role: 'host',
      isHost: true,
      user: { uid: this.hostUid, role: 'host' },
    });

    this.onOfferBound = async ({ streamId, senderSocketId, offer, sender }: any) => {
      if (streamId && streamId !== this.streamId) return;
      if (!senderSocketId || !offer) return;
      await this.handleViewerOffer(senderSocketId, offer, sender);
    };

    this.onCandidateBound = async ({ streamId, senderSocketId, candidate }: any) => {
      if (streamId && streamId !== this.streamId) return;
      if (!senderSocketId || !candidate) return;
      const pc = this.peerConnections.get(senderSocketId);
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('Error adding viewer ice candidate:', e);
        }
      } else {
        const queued = this.pendingCandidates.get(senderSocketId) || [];
        queued.push(candidate);
        this.pendingCandidates.set(senderSocketId, queued);
      }
    };

    this.socket.on('offer', this.onOfferBound);
    this.socket.on('ice-candidate', this.onCandidateBound);
  }

  private async handleViewerOffer(
    viewerSocketId: string,
    offer: RTCSessionDescriptionInit,
    _sender: any
  ) {
    try {
      const existingPc = this.peerConnections.get(viewerSocketId);
      if (existingPc) {
        existingPc.close();
        this.peerConnections.delete(viewerSocketId);
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      this.peerConnections.set(viewerSocketId, pc);

      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('ice-candidate', {
            streamId: this.streamId,
            targetSocketId: viewerSocketId,
            candidate: event.candidate.toJSON(),
            sender: { uid: this.hostUid, role: 'host' },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed'
        ) {
          this.peerConnections.delete(viewerSocketId);
          this.pendingCandidates.delete(viewerSocketId);
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Flush any ICE candidates received while description was pending
      const queued = this.pendingCandidates.get(viewerSocketId) || [];
      this.pendingCandidates.delete(viewerSocketId);
      for (const cand of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('Queued viewer ICE candidate error:', e);
        }
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.socket.emit('answer', {
        streamId: this.streamId,
        targetSocketId: viewerSocketId,
        answer: {
          type: answer.type,
          sdp: answer.sdp,
        },
        sender: { uid: this.hostUid, role: 'host' },
      });
    } catch (err) {
      console.error(`Error answering viewer ${viewerSocketId}:`, err);
    }
  }

  /**
   * Replaces active audio/video tracks on all peer connections (e.g., when flipping front/back camera).
   */
  public async replaceLocalStream(newStream: MediaStream) {
    this.localStream = newStream;
    const newVideoTrack = newStream.getVideoTracks()[0] || null;
    const newAudioTrack = newStream.getAudioTracks()[0] || null;

    const updates: Promise<void>[] = [];
    this.peerConnections.forEach((pc) => {
      pc.getSenders().forEach((sender) => {
        if (sender.track?.kind === 'video' && newVideoTrack) {
          updates.push(sender.replaceTrack(newVideoTrack));
        } else if (sender.track?.kind === 'audio' && newAudioTrack) {
          updates.push(sender.replaceTrack(newAudioTrack));
        }
      });
    });

    await Promise.allSettled(updates);
  }

  public destroy() {
    if (this.onOfferBound) this.socket.off('offer', this.onOfferBound);
    if (this.onCandidateBound) this.socket.off('ice-candidate', this.onCandidateBound);
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.pendingCandidates.clear();
    if (this.ownsSocket) {
      this.socket.emit('leave_stream', { streamId: this.streamId });
      this.socket.disconnect();
    }
  }
}

/**
 * Viewer WebRTC Manager: Sends `offer` to host via Socket.io and receives video/audio stream.
 */
export class ViewerSignaling {
  private streamId: string;
  private viewerId: string;
  private viewerInfo: { name: string; avatar?: string };
  private pc: RTCPeerConnection | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteStream: MediaStream | null = null;
  private socket: Socket;
  private ownsSocket: boolean;
  private onRemoteStreamCb: (stream: MediaStream) => void;
  private onAnswerBound?: (payload: any) => void;
  private onCandidateBound?: (payload: any) => void;
  private onHostReadyBound?: (payload: any) => void;

  constructor(
    streamId: string,
    viewerId: string,
    viewerInfo: { name: string; avatar?: string },
    onRemoteStream: (stream: MediaStream) => void,
    socket?: Socket
  ) {
    this.streamId = streamId;
    this.viewerId = viewerId;
    this.viewerInfo = viewerInfo;
    this.onRemoteStreamCb = onRemoteStream;
    this.ownsSocket = !socket;
    this.socket = socket || createSignalingSocket();
  }

  private setupPeerAndSendOffer = async () => {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.pendingCandidates = [];
    this.remoteStream = new MediaStream();

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.pc = pc;

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((t) => {
          if (!this.remoteStream!.getTracks().some((existing) => existing.id === t.id)) {
            this.remoteStream!.addTrack(t);
          }
        });
      }
      if (event.track && !this.remoteStream.getTracks().some((existing) => existing.id === event.track.id)) {
        this.remoteStream.addTrack(event.track);
      }
      this.onRemoteStreamCb(new MediaStream(this.remoteStream.getTracks()));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', {
          streamId: this.streamId,
          targetSocketId: 'host',
          candidate: event.candidate.toJSON(),
          sender: { uid: this.viewerId, ...this.viewerInfo },
        });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.socket.emit('offer', {
      streamId: this.streamId,
      targetSocketId: 'host',
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
      sender: { uid: this.viewerId, ...this.viewerInfo },
    });
  };

  public async connect() {
    this.onAnswerBound = async ({ streamId, answer }: any) => {
      if (streamId && streamId !== this.streamId) return;
      if (answer && this.pc && !this.pc.currentRemoteDescription) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
        const queued = [...this.pendingCandidates];
        this.pendingCandidates = [];
        for (const cand of queued) {
          try {
            await this.pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            console.warn('Queued host ICE candidate error:', e);
          }
        }
      }
    };

    this.onCandidateBound = async ({ streamId, candidate }: any) => {
      if (streamId && streamId !== this.streamId) return;
      if (!candidate) return;
      if (this.pc && this.pc.remoteDescription) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('Error adding host ice candidate:', e);
        }
      } else {
        this.pendingCandidates.push(candidate);
      }
    };

    this.onHostReadyBound = async ({ streamId }: any) => {
      if (streamId && streamId !== this.streamId) return;
      await this.setupPeerAndSendOffer();
    };

    this.socket.on('answer', this.onAnswerBound);
    this.socket.on('ice-candidate', this.onCandidateBound);
    this.socket.on('host_ready', this.onHostReadyBound);

    if (this.ownsSocket) {
      this.socket.emit('join_stream', {
        streamId: this.streamId,
        role: 'viewer',
        isHost: false,
        user: { uid: this.viewerId, ...this.viewerInfo },
      });
    }

    await this.setupPeerAndSendOffer();
  }

  public destroy() {
    if (this.onAnswerBound) this.socket.off('answer', this.onAnswerBound);
    if (this.onCandidateBound) this.socket.off('ice-candidate', this.onCandidateBound);
    if (this.onHostReadyBound) this.socket.off('host_ready', this.onHostReadyBound);
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.pendingCandidates = [];
    if (this.ownsSocket) {
      this.socket.emit('leave_stream', { streamId: this.streamId });
      this.socket.disconnect();
    }
  }
}
