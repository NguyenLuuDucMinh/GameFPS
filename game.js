// Lấy đối tượng canvas từ HTML
const canvas = document.getElementById("renderCanvas");

// Khởi tạo Babylon.js Engine
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

// --- Cấu hình Game ---
const MAX_TARGETS = 10; // Số lượng mục tiêu tối đa trên màn hình
const SPAWN_INTERVAL = 2000; // Thời gian giữa mỗi lần thử tạo mục tiêu (ms) - 2 giây

// Biến toàn cục để quản lý mục tiêu và bộ đếm thời gian
let movingTargets = [];
let spawnTimerInterval = null; // Để lưu trữ ID của setInterval

// Hàm tạo Scene (khung cảnh game)
const createScene = function () {
    // Tạo scene cơ bản
    const scene = new BABYLON.Scene(engine);
    scene.gravity = new BABYLON.Vector3(0, -0.9, 0);
    scene.collisionsEnabled = true;

    // --- Camera ---
    const camera = new BABYLON.FreeCamera("playerCamera", new BABYLON.Vector3(0, 1.8, -5), scene);
    camera.attachControl(canvas, true);
    camera.speed = 0.2;
    camera.angularSensibility = 4000;
    camera.checkCollisions = true;
    camera.applyGravity = true;
    camera.ellipsoid = new BABYLON.Vector3(0.5, 0.9, 0.5);
    camera.upperBetaLimit = Math.PI / 2.2;
    camera.lowerBetaLimit = Math.PI / 2.8;

    // --- Ánh sáng ---
    const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.8;

    // --- Môi trường ---
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, scene);
    ground.checkCollisions = true;
    const groundMaterial = new BABYLON.StandardMaterial("groundMat", scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    ground.material = groundMaterial;

    const box = BABYLON.MeshBuilder.CreateBox("box", {size: 2}, scene);
    box.position = new BABYLON.Vector3(5, 1, 5);
    box.checkCollisions = true;

    const box2 = BABYLON.MeshBuilder.CreateBox("box2", {size: 1}, scene);
    box2.position = new BABYLON.Vector3(-3, 0.5, 8);
    box2.checkCollisions = true;

    // --- Vật liệu cho Mục tiêu ---
    const targetMaterial = new BABYLON.StandardMaterial("targetMat", scene);
    targetMaterial.diffuseColor = new BABYLON.Color3(1, 0, 0); // Màu đỏ

    // --- Hàm Tạo Mục tiêu Mới (Reusable) ---
    const spawnTarget = () => {
        // Chỉ tạo nếu số lượng mục tiêu hiện tại < giới hạn
        if (movingTargets.length >= MAX_TARGETS) {
            // console.log("Đã đạt số lượng mục tiêu tối đa.");
            return; // Không tạo thêm
        }

        console.log("Tạo mục tiêu mới...");
        const targetId = `targetSphere_${Date.now()}_${Math.random().toString(16).slice(2)}`; // Tạo ID độc nhất
        const targetSphere = BABYLON.MeshBuilder.CreateSphere(targetId, { diameter: 1 }, scene);
        targetSphere.material = targetMaterial;
        targetSphere.checkCollisions = true;

        // Vị trí ban đầu ngẫu nhiên trên mặt đất (trong phạm vi ground)
        const spawnMargin = 2; // Khoảng cách từ biên
        const groundSize = 25 - spawnMargin;
        targetSphere.position = new BABYLON.Vector3(
            Math.random() * groundSize * 2 - groundSize, // X từ -groundSize đến +groundSize
            0.6, // Y (nhô lên mặt đất một chút)
            Math.random() * groundSize * 2 - groundSize  // Z từ -groundSize đến +groundSize
        );

        // Đảm bảo không spawn quá gần người chơi
        const minSpawnDist = 5;
        if (BABYLON.Vector3.Distance(targetSphere.position, camera.position) < minSpawnDist) {
             console.log("Vị trí spawn quá gần người chơi, hủy và thử lại sau.");
             targetSphere.dispose(); // Hủy mục tiêu vừa tạo
             return; // Sẽ thử lại ở lần gọi setInterval tiếp theo
        }


        targetSphere.moveDirection = new BABYLON.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        targetSphere.moveSpeed = Math.random() * 1.5 + 0.5;

        BABYLON.Tags.AddTagsTo(targetSphere, "movingTarget");
        movingTargets.push(targetSphere); // Thêm vào mảng quản lý
    };

    // --- Tạo các mục tiêu ban đầu ---
    movingTargets = []; // Đảm bảo mảng trống trước khi bắt đầu
    for (let i = 0; i < 3; i++) { // Bắt đầu với 3 mục tiêu
        spawnTarget();
    }

    // --- Bắt đầu tạo mục tiêu định kỳ ---
    // Xóa interval cũ nếu có (phòng trường hợp gọi createScene nhiều lần)
    if (spawnTimerInterval) {
        clearInterval(spawnTimerInterval);
    }
    // Tạo mục tiêu mới sau mỗi khoảng thời gian SPAWN_INTERVAL
    spawnTimerInterval = setInterval(spawnTarget, SPAWN_INTERVAL);


    // --- Logic Di chuyển Mục tiêu ---
    scene.registerBeforeRender(() => {
        const deltaTime = engine.getDeltaTime() / 1000.0;
        const boundSize = 24; // Kích thước biên

        // Nên duyệt ngược khi có khả năng xóa phần tử trong lúc duyệt
        for (let i = movingTargets.length - 1; i >= 0; i--) {
            const target = movingTargets[i];

            // Kiểm tra xem target còn tồn tại không (có thể đã bị bắn hạ)
            if (!target || target.isDisposed()) {
                // Nếu target không hợp lệ hoặc đã bị dispose, xóa nó khỏi mảng
                movingTargets.splice(i, 1);
                continue; // Chuyển sang phần tử tiếp theo
            }

            // Di chuyển target
            target.position.addInPlace(target.moveDirection.scale(target.moveSpeed * deltaTime));

            // Kiểm tra va chạm biên và đổi hướng
            let collided = false;
            if (target.position.x > boundSize || target.position.x < -boundSize) {
                target.moveDirection.x *= -1;
                target.position.x = Math.max(-boundSize, Math.min(boundSize, target.position.x));
                collided = true;
            }
            if (target.position.z > boundSize || target.position.z < -boundSize) {
                target.moveDirection.z *= -1;
                 target.position.z = Math.max(-boundSize, Math.min(boundSize, target.position.z));
                 collided = true;
            }

            // Nếu va chạm, có thể đổi nhẹ hướng Y để tránh kẹt (tùy chọn)
            // if (collided) {
            //    target.moveDirection.y = (Math.random() - 0.5) * 0.1; // Thêm chút dao động nhẹ chiều Y
            //    target.moveDirection.normalize(); // Chuẩn hóa lại vector hướng
            // }

            // Giữ mục tiêu trên mặt đất
            if (target.position.y < 0.5) {
                target.position.y = 0.5;
            }
        }
    });

    // --- Logic bắn súng ---
    function handleShooting(evt) {
        if (evt.button === 0) { // Chuột trái
            const ray = camera.getForwardRay(100);
            const hit = scene.pickWithRay(ray);

            if (hit.pickedMesh && hit.pickedPoint) {
                // Hiệu ứng bắn trúng
                const impactSphere = BABYLON.MeshBuilder.CreateSphere("impact", { diameter: 0.2 }, scene);
                impactSphere.position = hit.pickedPoint;
                const impactMat = new BABYLON.StandardMaterial("impactMat", scene);
                impactMat.diffuseColor = new BABYLON.Color3(1, 1, 0);
                impactMat.emissiveColor = new BABYLON.Color3(1, 0.5, 0);
                impactSphere.material = impactMat;
                setTimeout(() => impactSphere.dispose(), 150);

                // Xử lý khi bắn trúng mục tiêu di động
                if (BABYLON.Tags.HasTags(hit.pickedMesh) && BABYLON.Tags.MatchesQuery(hit.pickedMesh, "movingTarget")) {
                    console.log("Bắn trúng mục tiêu di động!");
                    hit.pickedMesh.dispose(); // Phá hủy mục tiêu

                    // **QUAN TRỌNG:** Tìm và xóa mục tiêu khỏi mảng movingTargets
                    const index = movingTargets.indexOf(hit.pickedMesh);
                    if (index > -1) {
                        movingTargets.splice(index, 1);
                         console.log("Đã xóa mục tiêu khỏi mảng. Hiện có:", movingTargets.length);
                    } else {
                         // Điều này không nên xảy ra nếu logic đúng, nhưng nên kiểm tra
                         console.warn("Không tìm thấy mục tiêu đã dispose trong mảng movingTargets.");
                    }
                    // Không cần return, có thể có hiệu ứng khác nếu cần

                } else if (hit.pickedMesh.name.startsWith("box")) {
                     console.log("Bắn trúng hộp!");
                } else {
                     console.log("Bắn trúng:", hit.pickedMesh.name);
                }
            }
        }
    }

    // --- Khóa con trỏ chuột ---
    let isPointerLocked = false;
    scene.onPointerDown = (evt) => {
        if (!isPointerLocked && evt.button === 0) {
            canvas.requestPointerLock = canvas.requestPointerLock || canvas.msRequestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
            if (canvas.requestPointerLock) {
                canvas.requestPointerLock();
            }
        }
        handleShooting(evt); // Gọi hàm xử lý bắn
    };

    const pointerlockchange = () => {
        isPointerLocked = !!(document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement || document.msPointerLockElement);
    };

    document.addEventListener("pointerlockchange", pointerlockchange, false);
    document.addEventListener("mspointerlockchange", pointerlockchange, false);
    document.addEventListener("mozpointerlockchange", pointerlockchange, false);
    document.addEventListener("webkitpointerlockchange", pointerlockchange, false);


    // --- Dọn dẹp khi Scene bị hủy (quan trọng để dừng interval) ---
    scene.onDisposeObservable.add(() => {
        console.log("Dọn dẹp scene, dừng tạo mục tiêu.");
        if (spawnTimerInterval) {
            clearInterval(spawnTimerInterval);
            spawnTimerInterval = null;
        }
        // Xóa các event listener của document nếu cần (tránh memory leak nếu tạo scene nhiều lần)
        document.removeEventListener("pointerlockchange", pointerlockchange, false);
        document.removeEventListener("mspointerlockchange", pointerlockchange, false);
        document.removeEventListener("mozpointerlockchange", pointerlockchange, false);
        document.removeEventListener("webkitpointerlockchange", pointerlockchange, false);

        // Dispose các mục tiêu còn lại nếu cần thiết
        movingTargets.forEach(target => {
            if (target && !target.isDisposed()) {
                target.dispose();
            }
        });
        movingTargets = []; // Xóa sạch mảng
    });


    return scene;
};

// Tạo scene ban đầu
let currentScene = createScene();

// Chạy vòng lặp render
engine.runRenderLoop(function () {
    if (currentScene) {
        currentScene.render();
    }
});

// Xử lý resize
window.addEventListener("resize", function () {
    engine.resize();
});

// Ví dụ: Cách tạo lại scene (nếu cần, ví dụ khi reset game)
// function resetGame() {
//     console.log("Resetting game...");
//     if (currentScene) {
//         currentScene.dispose(); // Gọi dispose để kích hoạt dọn dẹp (clearInterval)
//     }
//     currentScene = createScene();
// }
// setTimeout(resetGame, 30000); // Ví dụ reset sau 30 giây