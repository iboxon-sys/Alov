/**
 * WebRTC Signaling & Connection Service for Alov.uz Live Streaming
 * Uses Render Server Socket.io for real-time SDP & ICE candidate exchange (Zero Firestore).
 */
import { getApiUrl, getBaseUrl } from '../config/api';
import { io, Socket } from 'socket.io-client';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
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

export interface LiveChatMessage {
  id: string;
  senderUid: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  createdAt?: string;
}

/**
 * Start a live stream session as Host
 */
export async function createLiveStream(hostUser: { uid: string; name: string; avatar?: string }, title: string): Promise<string> {
  const streamId = 'stream_' + hostUser.uid + '_' + Date.now();
  try {
    await fetch(getApiUrl('/api/live-streams/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        streamId,
        hostUid: hostUser.uid,
        hostName: hostUser.name || 'Alov Strimer',
        hostAvatar: hostUser.avatar || '',
        title: title || 'Jonli Efir'
      })
    });
  } catch (err) {
    console.error("Error creating live stream:", err);
  }
  return streamId;
}

/**
 * Stop live stream session as Host
 */
export async function stopLiveStream(streamId: string, hostUid: string) {
  try {
    await fetch(getApiUrl('/api/live-streams/stop'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streamId, hostUid })
    });
  } catch (err) {
    console.error("Error stopping live stream:", err);
  }
}

/**
 * Host WebRTC Manager: Listens for incoming viewers via Socket.io and streams video/audio
 */
export class BroadcasterSignaling {
  private streamId: string;
  private localStream: MediaStream;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private socket: Socket;

  constructor(streamId: string, localStream: MediaStream, socket?: Socket) {
    this.streamId = streamId;
    this.localStream = localStream;
    this.socket = socket || io(getBaseUrl());
  }

  public startListening() {
    this.socket.emit('join_live_stream', { streamId: this.streamId, user: { role: 'host' } });

    // When viewer joins and sends offer
    this.socket.on('live_stream_offer', async ({ senderSocketId, offer, sender }: any) => {
      await this.handleViewerOffer(senderSocketId, offer, sender);
    });

    // When viewer sends ICE candidate
    this.socket.on('live_stream_ice_candidate', async ({ senderSocketId, candidate }: any) => {
      const pc = this.peerConnections.get(senderSocketId);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("Error adding viewer ice candidate:", e);
        }
      }
    });
  }

  private async handleViewerOffer(viewerSocketId: string, offer: RTCSessionDescriptionInit, _sender: any) {
    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      this.peerConnections.set(viewerSocketId, pc);

      // Add local media tracks to peer connection
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });

      // Handle ICE Candidates from host to viewer via Socket.io
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('live_stream_ice_candidate', {
            streamId: this.streamId,
            targetSocketId: viewerSocketId,
            candidate: event.candidate.toJSON(),
            sender: { role: 'host' }
          });
        }
      };

      // Set remote offer from viewer
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer back to viewer via Socket.io
      this.socket.emit('live_stream_answer', {
        streamId: this.streamId,
        targetSocketId: viewerSocketId,
        answer: {
          type: answer.type,
          sdp: answer.sdp
        },
        sender: { role: 'host' }
      });
    } catch (err) {
      console.error(`Error answering viewer ${viewerSocketId}:`, err);
    }
  }

  public destroy() {
    this.socket.emit('leave_live_stream', { streamId: this.streamId });
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
  }
}

/**
 * Viewer WebRTC Manager: Sends offer to host via Socket.io and receives video/audio
 */
export class ViewerSignaling {
  private streamId: string;
  private viewerId: string;
  private viewerInfo: { name: string; avatar?: string };
  private pc: RTCPeerConnection | null = null;
  private socket: Socket;
  private onRemoteStreamCb: (stream: MediaStream) => void;

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
    this.socket = socket || io(getBaseUrl());
  }

  public async connect() {
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    // Request receive-only video & audio
    this.pc.addTransceiver('video', { direction: 'recvonly' });
    this.pc.addTransceiver('audio', { direction: 'recvonly' });

    // Handle remote track arriving
    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.onRemoteStreamCb(event.streams[0]);
      }
    };

    // Forward viewer ICE candidates to host via Socket.io
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('live_stream_ice_candidate', {
          streamId: this.streamId,
          targetSocketId: 'host',
          candidate: event.candidate.toJSON(),
          sender: { viewerId: this.viewerId, ...this.viewerInfo }
        });
      }
    };

    // Join room on Socket.io
    this.socket.emit('join_live_stream', {
      streamId: this.streamId,
      user: { viewerId: this.viewerId, ...this.viewerInfo }
    });

    // Listen for Host answer
    this.socket.on('live_stream_answer', async ({ answer }: any) => {
      if (answer && this.pc && !this.pc.currentRemoteDescription) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    // Listen for Host ICE Candidates
    this.socket.on('live_stream_ice_candidate', async ({ candidate }: any) => {
      if (candidate && this.pc) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("Error adding host ice candidate:", e);
        }
      }
    });

    // Create SDP Offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Send offer to host via Socket.io
    this.socket.emit('live_stream_offer', {
      streamId: this.streamId,
      targetSocketId: 'host',
      offer: {
        type: offer.type,
        sdp: offer.sdp
      },
      sender: { viewerId: this.viewerId, ...this.viewerInfo }
    });
  }

  public destroy() {
    this.socket.emit('leave_live_stream', { streamId: this.streamId });
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
