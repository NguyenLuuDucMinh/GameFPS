// Lấy đối tượng canvas từ HTML
const canvas = document.getElementById("renderCanvas");

// Khởi tạo Babylon.js Engine
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

// --- Cấu hình Game ---
const MAX_TARGETS = 10; // Số lượng mục tiêu tối đa trên màn hình
const SPAWN_INTERVAL = 2000; // Thời gian giữa mỗi lần thử tạo mục tiêu (ms) - 2 giây
const DEFAULT_SENSITIVITY = 4000; // Giá trị độ nhạy mặc định

// Biến toàn cục
let movingTargets = [];
let spawnTimerInterval = null;
let playerCamera = null; // Tham chiếu đến camera
// Các biến liên quan đến súng 3D đã được xóa
let isPointerLocked = false; // Trạng thái khóa chuột
let shadowGenerator = null; // Tham chiếu đến shadow generator

// --- Lấy phần tử điều khiển độ nhạy ---
const sensitivitySlider = document.getElementById("sensitivitySlider");
const sensitivityValueSpan = document.getElementById("sensitivityValue");

// Hàm tạo Scene (khung cảnh game)
const createScene = function () {
    // Tạo scene cơ bản
    const scene = new BABYLON.Scene(engine);
    scene.gravity = new BABYLON.Vector3(0, -9.81, 0); // Trọng lực thực tế hơn
    scene.collisionsEnabled = true;

    // --- Camera ---
    playerCamera = new BABYLON.FreeCamera("playerCamera", new BABYLON.Vector3(0, 1.8, -5), scene);
    playerCamera.attachControl(canvas, true);
    playerCamera.speed = 0.2;
    playerCamera.angularSensibility = DEFAULT_SENSITIVITY; // Độ nhạy chuột
    playerCamera.checkCollisions = true;
    playerCamera.applyGravity = true;
    playerCamera.ellipsoid = new BABYLON.Vector3(0.5, 0.9, 0.5);
    playerCamera.ellipsoidOffset = new BABYLON.Vector3(0, 0.9, 0);
    playerCamera.upperBetaLimit = Math.PI / 2.1;
    playerCamera.lowerBetaLimit = Math.PI / 2.5;

    // --- Ánh sáng ---
    const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.6;
    const light2 = new BABYLON.PointLight("pointLight", new BABYLON.Vector3(0, 5, -5), scene);
    light2.intensity = 0.8;
    light2.shadowMinZ = 1;
    light2.shadowMaxZ = 100;

    // --- Môi trường ---
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);
    ground.checkCollisions = true;
    const groundMaterial = new BABYLON.StandardMaterial("groundMat", scene);
    try {
        groundMaterial.diffuseTexture = new BABYLON.Texture("https://www.babylonjs-playground.com/textures/grass.png", scene);
        groundMaterial.diffuseTexture.uScale = 6; groundMaterial.diffuseTexture.vScale = 6;
    } catch (e) {
        console.warn("Could not load ground texture, using fallback color.");
        groundMaterial.diffuseColor = new BABYLON.Color3(0.5, 0.7, 0.5);
    }
    groundMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    ground.material = groundMaterial;
    ground.receiveShadows = true;

    const box = BABYLON.MeshBuilder.CreateBox("box", {size: 2}, scene);
    box.position = new BABYLON.Vector3(5, 1, 5);
    box.checkCollisions = true; box.receiveShadows = true;
    const boxMat = new BABYLON.StandardMaterial("boxMat", scene); boxMat.diffuseColor = new BABYLON.Color3(0.8, 0.6, 0.4); box.material = boxMat;

    const box2 = BABYLON.MeshBuilder.CreateBox("box2", {size: 1}, scene);
    box2.position = new BABYLON.Vector3(-3, 0.5, 8);
    box2.checkCollisions = true; box2.receiveShadows = true;
    const box2Mat = new BABYLON.StandardMaterial("box2Mat", scene); box2Mat.diffuseColor = new BABYLON.Color3(0.4, 0.5, 0.7); box2.material = box2Mat;

    // --- Tạo Shadow Generator ---
    shadowGenerator = new BABYLON.ShadowGenerator(1024, light2);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32; shadowGenerator.darkness = 0.5;
    shadowGenerator.addShadowCaster(box); shadowGenerator.addShadowCaster(box2);

    // --- Vật liệu cho Mục tiêu ---
    const targetMaterial = new BABYLON.StandardMaterial("targetMat", scene);
    targetMaterial.diffuseColor = new BABYLON.Color3(1, 0, 0);
    targetMaterial.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);

    // --- Phần tạo/load súng 3D đã được XÓA ---
    // (Vì đang sử dụng HTML/CSS overlay)

    // --- Hàm Tạo Mục tiêu Mới ---
    const spawnTarget = () => {
        if (!shadowGenerator || movingTargets.length >= MAX_TARGETS) {
            return;
        }
        const targetId = `targetSphere_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const targetSphere = BABYLON.MeshBuilder.CreateSphere(targetId, { diameter: 1 }, scene);
        targetSphere.material = targetMaterial;
        targetSphere.checkCollisions = true;
        targetSphere.isPickable = true; // Đảm bảo mục tiêu có thể bắn trúng
        const spawnMargin = 3;
        const groundSize = 25 - spawnMargin;
        targetSphere.position = new BABYLON.Vector3(
            (Math.random() * groundSize * 2 - groundSize), 0.6, (Math.random() * groundSize * 2 - groundSize)
        );
        const minSpawnDist = 6;
        if (playerCamera && BABYLON.Vector3.DistanceSquared(targetSphere.position, playerCamera.position) < minSpawnDist * minSpawnDist) {
            targetSphere.dispose(); return;
        }
        targetSphere.moveDirection = new BABYLON.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        targetSphere.moveSpeed = Math.random() * 1.8 + 0.7;
        BABYLON.Tags.AddTagsTo(targetSphere, "movingTarget");
        movingTargets.push(targetSphere);
        shadowGenerator.addShadowCaster(targetSphere);
    };

    // --- Tạo các mục tiêu ban đầu ---
    movingTargets = [];
    setTimeout(() => { for (let i = 0; i < 3; i++) { spawnTarget(); } }, 500);

    // --- Bắt đầu tạo mục tiêu định kỳ ---
    if (spawnTimerInterval) { clearInterval(spawnTimerInterval); }
    spawnTimerInterval = setInterval(spawnTarget, SPAWN_INTERVAL);

    // --- Logic Di chuyển Mục tiêu ---
    scene.registerBeforeRender(() => {
        if (!engine) return;
        const deltaTime = engine.getDeltaTime() / 1000.0;
        const boundSize = 24.5;
        for (let i = movingTargets.length - 1; i >= 0; i--) {
            const target = movingTargets[i];
            if (!target || target.isDisposed()) { movingTargets.splice(i, 1); continue; }
            target.position.addInPlace(target.moveDirection.scale(target.moveSpeed * deltaTime));
            let bounced = false;
            if (target.position.x > boundSize || target.position.x < -boundSize) { target.moveDirection.x *= -1; target.position.x = Math.max(-boundSize, Math.min(boundSize, target.position.x)); bounced = true; }
            if (target.position.z > boundSize || target.position.z < -boundSize) { target.moveDirection.z *= -1; target.position.z = Math.max(-boundSize, Math.min(boundSize, target.position.z)); bounced = true; }
            if (bounced) { target.moveDirection.addInPlace(new BABYLON.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2)); target.moveDirection.normalize(); }
            if (target.position.y < 0.5) target.position.y = 0.5;
        }
        // Cập nhật hiển thị độ nhạy
        if (playerCamera && sensitivityValueSpan.textContent !== playerCamera.angularSensibility.toString()) {
             sensitivityValueSpan.textContent = playerCamera.angularSensibility;
             if (sensitivitySlider.value !== playerCamera.angularSensibility.toString()) {
                 sensitivitySlider.value = playerCamera.angularSensibility;
             }
        }
    });

    // --- Logic bắn súng (Giữ nguyên) ---
    function handleShooting(evt) {
        if (!isPointerLocked || evt.button !== 0 || !scene || !playerCamera || !shadowGenerator) return;
        const ray = scene.createPickingRay(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2, null, playerCamera);
        const hit = scene.pickWithRay(ray, (mesh) => mesh.isPickable);
        if (hit.pickedMesh && hit.pickedPoint) {
            const impactSphere = BABYLON.MeshBuilder.CreateSphere("impact", { diameter: 0.15, segments: 6 }, scene);
            impactSphere.position = hit.pickedPoint;
            const impactMat = new BABYLON.StandardMaterial("impactMat", scene);
            impactMat.diffuseColor = new BABYLON.Color3(1, 1, 0.5); impactMat.emissiveColor = new BABYLON.Color3(0.8, 0.8, 0); impactMat.disableLighting = true;
            impactSphere.material = impactMat; impactSphere.renderingGroupId = 2; impactSphere.isPickable = false;
            setTimeout(() => { if (impactSphere && !impactSphere.isDisposed()) impactSphere.dispose(); }, 100);

            if (!hit.pickedMesh.isDisposed() && BABYLON.Tags.HasTags(hit.pickedMesh) && BABYLON.Tags.MatchesQuery(hit.pickedMesh, "movingTarget")) {
                const targetToDispose = hit.pickedMesh;
                shadowGenerator.removeShadowCaster(targetToDispose);
                const index = movingTargets.indexOf(targetToDispose);
                if (index > -1) movingTargets.splice(index, 1);
                targetToDispose.dispose();
            }
        }
    }

    // --- Khóa con trỏ chuột (Giữ nguyên) ---
    scene.onPointerDown = (evt) => {
        if (!isPointerLocked && evt.button === 0) {
            canvas.requestPointerLock = canvas.requestPointerLock || canvas.msRequestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
            if (canvas.requestPointerLock) canvas.requestPointerLock();
        }
        handleShooting(evt);
    };
    const pointerlockchange = () => { isPointerLocked = !!(document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement || document.msPointerLockElement); };
    document.addEventListener("pointerlockchange", pointerlockchange, false);
    document.addEventListener("mspointerlockchange", pointerlockchange, false);
    document.addEventListener("mozpointerlockchange", pointerlockchange, false);
    document.addEventListener("webkitpointerlockchange", pointerlockchange, false);

    // --- Dọn dẹp khi Scene bị hủy ---
    scene.onDisposeObservable.add(() => {
        console.log("Disposing scene, cleaning up resources...");
        if (spawnTimerInterval) { clearInterval(spawnTimerInterval); spawnTimerInterval = null; }
        document.removeEventListener("pointerlockchange", pointerlockchange, false);
        document.removeEventListener("mspointerlockchange", pointerlockchange, false);
        document.removeEventListener("mozpointerlockchange", pointerlockchange, false);
        document.removeEventListener("webkitpointerlockchange", pointerlockchange, false);

        movingTargets.forEach(target => {
            if (target && !target.isDisposed()) { if (shadowGenerator) shadowGenerator.removeShadowCaster(target); target.dispose(); }
        });
        movingTargets = [];

        // --- Phần dọn dẹp súng 3D đã được XÓA ---

        playerCamera = null;
        shadowGenerator = null;

        if (document.pointerLockElement === canvas) document.exitPointerLock();
        console.log("Scene cleanup complete.");
    });

    return scene;
};

// Tạo scene ban đầu
let currentScene = createScene();

// --- Thiết lập Event Listener cho thanh trượt độ nhạy (Giữ nguyên) ---
sensitivitySlider.addEventListener('input', function() {
    if (playerCamera) {
        const newSensitivity = parseFloat(this.value);
        playerCamera.angularSensibility = newSensitivity;
        sensitivityValueSpan.textContent = newSensitivity;
    }
});
sensitivitySlider.value = DEFAULT_SENSITIVITY;
sensitivityValueSpan.textContent = DEFAULT_SENSITIVITY;

// --- Event Listener để Đổi Súng đã được XÓA ---

// --- Chạy vòng lặp render (Giữ nguyên) ---
engine.runRenderLoop(function () {
    if (currentScene && currentScene.isReady()) {
        currentScene.render();
    }
});

// --- Xử lý resize cửa sổ (Giữ nguyên) ---
window.addEventListener("resize", function () {
    engine.resize();
});

// --- Hàm Reset Game (Đã xóa phần reset súng) ---
function resetGame() {
    console.log("----- Resetting Game -----");
    if (currentScene) {
        currentScene.dispose();
    }
    currentScene = createScene(); // Tạo scene mới
    // Reset thanh trượt
    sensitivitySlider.value = DEFAULT_SENSITIVITY;
    sensitivityValueSpan.textContent = DEFAULT_SENSITIVITY;
    // Không cần reset trạng thái súng 3D nữa
    console.log("Game reset complete. New scene created.");
}