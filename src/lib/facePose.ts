import { yawFromEyesAndNose, yawFromTransformationMatrix } from "./yaw.ts";

const wasmBase = `${import.meta.env.BASE_URL}face-landmarker/wasm`;
const modelUrl = `${import.meta.env.BASE_URL}face-landmarker/face_landmarker.task`;

type PosePipeline = "matrix" | "landmarks";

type Landmarker = {
  detectForVideo: (
    frame: CanvasImageSource,
    timestamp: number,
  ) => {
    faceLandmarks: Array<Array<{ x: number; y: number; z: number }>>;
    facialTransformationMatrixes: Array<{ data: number[] }>;
  };
  close: () => void;
};

export type FaceYawReader = {
  read: (frame: CanvasImageSource, timestamp: number) => number | null;
  close: () => void;
};

export async function createFaceYawReader(): Promise<FaceYawReader> {
  const vision = await import("@mediapipe/tasks-vision");
  const fileset = await vision.FilesetResolver.forVisionTasks(wasmBase);
  const landmarker = (await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: modelUrl,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
    outputFaceBlendshapes: false,
  })) as Landmarker;

  let pipeline: PosePipeline | null = null;
  let lastTimestamp = -1;

  return {
    read(frame, timestamp) {
      const advancing = timestamp > lastTimestamp ? timestamp : lastTimestamp + 1;
      lastTimestamp = advancing;
      let result: ReturnType<Landmarker["detectForVideo"]>;
      try {
        result = landmarker.detectForVideo(frame, advancing);
      } catch {
        return null;
      }
      const matrix = result.facialTransformationMatrixes?.[0]?.data;
      const landmarks = result.faceLandmarks?.[0];
      const hasMatrix = !!matrix && matrix.length >= 16;
      const hasLandmarks = !!landmarks && landmarks.length > 263;
      if (!hasMatrix && !hasLandmarks) return null;
      pipeline ??= hasMatrix ? "matrix" : "landmarks";
      if (pipeline === "matrix") {
        return hasMatrix ? yawFromTransformationMatrix(matrix) : null;
      }
      if (!hasLandmarks) return null;
      const nose = landmarks[1];
      const subjectRightEye = landmarks[33];
      const subjectLeftEye = landmarks[263];
      if (!nose || !subjectRightEye || !subjectLeftEye) return null;
      return yawFromEyesAndNose(subjectRightEye, subjectLeftEye, nose);
    },
    close() {
      try {
        landmarker.close();
      } catch {
        // Closing the local runtime is best-effort.
      }
    },
  };
}
