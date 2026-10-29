/**
 * WebRTC Signaling & Connection Service for Alov.uz Live Streaming
 * Uses Firebase Firestore for real-time SDP & ICE candidate exchange.
 */
import { 
  db, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  deleteDoc
} from '../firebase';

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
  createdAt?: any;
}

export interface LiveChatMessage {
  id: string;
  senderUid: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  createdAt?: any;
}

/**
 * Start a live stream session as Host
 */
export async function createLiveStream(hostUser: { uid: string; name: string; avatar?: string }, title: string): Promise<string> {
  const streamId = 'stream_' + hostUser.uid + '_' + Date.now();
  const streamRef = doc(db, 'live_streams', streamId);

  await setDoc(streamRef, {
    streamId,
    hostUid: hostUser.uid,
    hostName: hostUser.name || 'Alov Strimer',
    hostAvatar: hostUser.avatar || '',
    title: title || "Jonli Efir",
    status: 'active',
    viewerCount: 1,
    createdAt: serverTimestamp()
  });

  // Update host user doc to indicate live status for map & profile
  await setDoc(doc(db, 'users', hostUser.uid), {
    isLive: true,
    liveStreamId: streamId,
    liveTitle: title || "Jonli Efir"
  }, { merge: true });

  return streamId;
}

/**
 * Stop live stream session as Host
 */
export async function stopLiveStream(streamId: string, hostUid: string) {
  try {
    const streamRef = doc(db, 'live_streams', streamId);
    await setDoc(streamRef, {
      status: 'ended',
      endedAt: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, 'users', hostUid), {
      isLive: false,
      liveStreamId: null,
      liveTitle: null
    }, { merge: true });
  } catch (err) {
    console.error("Error stopping live stream:", err);
  }
}

/**
 * Host WebRTC Manager: Listens for incoming viewers and sends local media tracks
 */
export class BroadcasterSignaling {
  private streamId: string;
  private localStream: MediaStream;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private unsubViewers: (() => void) | null = null;

  constructor(streamId: string, localStream: MediaStream) {
    this.streamId = streamId;
    this.localStream = localStream;
  }

  public startListening() {
    const viewersCol = collection(db, 'live_streams', this.streamId, 'viewers');

    this.unsubViewers = onSnapshot(viewersCol, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        const viewerId = change.doc.id;
        const data = change.doc.data();

        if (change.type === 'added' || change.type === 'modified') {
          // New viewer sent an offer
          if (data.offer && !data.answer && !this.peerConnections.has(viewerId)) {
            await this.handleViewerOffer(viewerId, data.offer);
          }
        } else if (change.type === 'removed') {
          // Viewer disconnected
          const pc = this.peerConnections.get(viewerId);
          if (pc) {
            pc.close();
            this.peerConnections.delete(viewerId);
          }
        }
      });
    });
  }

  private async handleViewerOffer(viewerId: string, offer: RTCSessionDescriptionInit) {
    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      this.peerConnections.set(viewerId, pc);

      // Add local media tracks to peer connection
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });

      // Handle ICE Candidates from host to viewer
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candCol = collection(db, 'live_streams', this.streamId, 'viewers', viewerId, 'hostCandidates');
          addDoc(candCol, event.candidate.toJSON()).catch(console.error);
        }
      };

      // Listen for viewer's ICE candidates
      const viewerCandCol = collection(db, 'live_streams', this.streamId, 'viewers', viewerId, 'viewerCandidates');
      onSnapshot(viewerCandCol, (candSnap) => {
        candSnap.docChanges().forEach((cChange) => {
          if (cChange.type === 'added') {
            const candidateData = cChange.doc.data();
            pc.addIceCandidate(new RTCIceCandidate(candidateData)).catch(console.error);
          }
        });
      });

      // Set remote offer from viewer
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Save answer to viewer document
      const viewerDocRef = doc(db, 'live_streams', this.streamId, 'viewers', viewerId);
      await setDoc(viewerDocRef, {
        answer: {
          type: answer.type,
          sdp: answer.sdp
        }
      }, { merge: true });

    } catch (err) {
      console.error(`Error answering viewer ${viewerId}:`, err);
    }
  }

  public destroy() {
    if (this.unsubViewers) {
      this.unsubViewers();
      this.unsubViewers = null;
    }
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
  }
}

/**
 * Viewer WebRTC Manager: Sends offer to host and listens for remote stream
 */
export class ViewerSignaling {
  private streamId: string;
  private viewerId: string;
  private viewerInfo: { name: string; avatar?: string };
  private pc: RTCPeerConnection | null = null;
  private unsubDoc: (() => void) | null = null;
  private unsubCandidates: (() => void) | null = null;
  private onRemoteStreamCb: (stream: MediaStream) => void;

  constructor(
    streamId: string, 
    viewerId: string, 
    viewerInfo: { name: string; avatar?: string },
    onRemoteStream: (stream: MediaStream) => void
  ) {
    this.streamId = streamId;
    this.viewerId = viewerId;
    this.viewerInfo = viewerInfo;
    this.onRemoteStreamCb = onRemoteStream;
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

    // Save viewer ICE candidates to Firestore
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candCol = collection(db, 'live_streams', this.streamId, 'viewers', this.viewerId, 'viewerCandidates');
        addDoc(candCol, event.candidate.toJSON()).catch(console.error);
      }
    };

    // Create SDP Offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Write viewer offer to Firestore
    const viewerDocRef = doc(db, 'live_streams', this.streamId, 'viewers', this.viewerId);
    await setDoc(viewerDocRef, {
      offer: {
        type: offer.type,
        sdp: offer.sdp
      },
      viewerName: this.viewerInfo.name || 'Tomoshabin',
      viewerAvatar: this.viewerInfo.avatar || '',
      joinedAt: serverTimestamp()
    });

    // Listen for Host answer
    this.unsubDoc = onSnapshot(viewerDocRef, async (snap) => {
      const data = snap.data();
      if (data?.answer && this.pc && !this.pc.currentRemoteDescription) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    // Listen for Host ICE Candidates
    const hostCandCol = collection(db, 'live_streams', this.streamId, 'viewers', this.viewerId, 'hostCandidates');
    this.unsubCandidates = onSnapshot(hostCandCol, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const cand = change.doc.data();
          if (this.pc) {
            this.pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.error);
          }
        }
      });
    });
  }

  public destroy() {
    if (this.unsubDoc) {
      this.unsubDoc();
      this.unsubDoc = null;
    }
    if (this.unsubCandidates) {
      this.unsubCandidates();
      this.unsubCandidates = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    // Clean up viewer document
    deleteDoc(doc(db, 'live_streams', this.streamId, 'viewers', this.viewerId)).catch(() => {});
  }
}
