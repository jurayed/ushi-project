class CharacterEngine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.mesh = null;
        this.material = null;
        this.clock = new THREE.Clock();

        // Animation State
        this.params = {
            breathSpeed: 1.0,
            mouthOpen: 0.0,
            mouseX: 0,
            mouseY: 0
        };

        // Audio
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.isListening = false;

        this.init();
    }

    init() {
        // 1. Setup Three.js
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111111);

        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.z = 3;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // 2. Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambient);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
        dirLight.position.set(1, 2, 3);
        this.scene.add(dirLight);

        // 3. Events
        window.addEventListener('resize', () => this.onResize());
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));

        // 4. Start Loop
        this.animate();
    }

    loadCharacter(imageUrl) {
        if (this.mesh) {
            this.scene.remove(this.mesh);
        }

        const loader = new THREE.TextureLoader();
        loader.load(imageUrl, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;

            // Create a subdivided plane for deformation
            // 32x32 segments allows for decent vertex manipulation
            const geometry = new THREE.PlaneGeometry(2, 2, 32, 32);

            // Custom Shader Material for "2.5D" effects
            this.material = new THREE.ShaderMaterial({
                uniforms: {
                    map: { value: texture },
                    time: { value: 0 },
                    breathSpeed: { value: 1.0 },
                    mouthOpen: { value: 0.0 },
                    mousePos: { value: new THREE.Vector2(0, 0) }
                },
                vertexShader: `
                    uniform float time;
                    uniform float breathSpeed;
                    uniform float mouthOpen;
                    uniform vec2 mousePos;
                    varying vec2 vUv;

                    void main() {
                        vUv = uv;
                        vec3 pos = position;

                        // 1. Breathing (Expand chest)
                        // Affects vertices in the middle-y range more
                        float chestFactor = smoothstep(0.2, 0.8, uv.y) * smoothstep(0.8, 0.2, uv.y);
                        float breath = sin(time * breathSpeed) * 0.02 * chestFactor;
                        pos.z += breath;

                        // 2. Head Tracking (Pseudo-3D)
                        // Bend the plane based on mouse position
                        float bendX = mousePos.x * 0.2;
                        float bendY = mousePos.y * 0.2;
                        // Parallax effect: move center vertices more than edges? 
                        // Or simple rotation? Let's do simple rotation + slight Z-warp
                        
                        // 3. Mouth Movement (Jaw Drop)
                        // Affects vertices in the lower-middle area (approx mouth)
                        // Assuming mouth is around uv.y 0.3-0.4 and uv.x 0.4-0.6
                        float mouthRegion = smoothstep(0.2, 0.4, uv.y) * smoothstep(0.5, 0.2, uv.y) 
                                          * smoothstep(0.3, 0.7, uv.x);
                        
                        // Drop y for mouth region
                        pos.y -= mouthOpen * 0.1 * mouthRegion;

                        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D map;
                    varying vec2 vUv;

                    void main() {
                        vec4 texColor = texture2D(map, vUv);
                        
                        // Simple Chroma Key / Background Removal
                        // Assuming white background (common for wiki images)
                        float brightness = (texColor.r + texColor.g + texColor.b) / 3.0;
                        if (brightness > 0.9 && texColor.a > 0.1) {
                            discard; 
                        }
                        
                        if (texColor.a < 0.1) discard; 
                        gl_FragColor = texColor;
                    }
                `,
                transparent: true,
                side: THREE.DoubleSide
            });

            this.mesh = new THREE.Mesh(geometry, this.material);
            this.scene.add(this.mesh);

            // Adjust aspect ratio if needed
            const aspect = texture.image.width / texture.image.height;
            this.mesh.scale.set(2, 2 / aspect, 1);
        });
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onMouseMove(e) {
        // Normalize -1 to 1
        this.params.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        this.params.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    }

    updateAudio() {
        if (!this.isListening || !this.analyser) return;

        this.analyser.getByteFrequencyData(this.dataArray);
        let sum = 0;
        // Focus on speech frequencies (lower half of bins)
        const binCount = this.dataArray.length / 2;
        for (let i = 0; i < binCount; i++) {
            sum += this.dataArray[i];
        }
        const avg = sum / binCount;

        // Map volume to mouth open (0.0 to 1.0)
        // Sensitivity adjustment: avg usually 0-100 for speech
        const targetOpen = Math.min(1.0, Math.max(0, (avg - 10) / 40));

        // Smooth transition
        this.params.mouthOpen += (targetOpen - this.params.mouthOpen) * 0.3;

        // Update UI slider to reflect audio
        document.getElementById('mouthOpen').value = this.params.mouthOpen;
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const time = this.clock.getElapsedTime();

        // Update Audio Logic
        this.updateAudio();

        // Update Shader Uniforms
        if (this.material) {
            this.material.uniforms.time.value = time;
            this.material.uniforms.breathSpeed.value = this.params.breathSpeed;
            this.material.uniforms.mouthOpen.value = this.params.mouthOpen;

            // Smooth mouse damping
            const currentMouse = this.material.uniforms.mousePos.value;
            currentMouse.x += (this.params.mouseX - currentMouse.x) * 0.1;
            currentMouse.y += (this.params.mouseY - currentMouse.y) * 0.1;

            // Also rotate the mesh slightly for 2.5D feel
            if (this.mesh) {
                this.mesh.rotation.y = currentMouse.x * 0.2;
                this.mesh.rotation.x = -currentMouse.y * 0.2;
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    async enableMic() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.analyser);
            this.analyser.fftSize = 256;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.isListening = true;
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
}

// --- Initialization & UI Logic ---
const engine = new CharacterEngine('canvas-container');

// Default Load (Placeholder or Generated Asset)
// We'll try to load one of the generated assets if available, or a fallback
// For now, let's assume the user will click generate.

const charNameInput = document.getElementById('charName');
const generateBtn = document.getElementById('generateBtn');
const breathSlider = document.getElementById('breathSpeed');
const mouthSlider = document.getElementById('mouthOpen');
const micBtn = document.getElementById('micBtn');

// Mock Asset Map (In a real app, this would be dynamic generation)
const MOCK_ASSETS = {
    'cheburashka': 'assets/cheburashka_real.png',
    'batman': 'assets/batman_sprite.png'
};

generateBtn.addEventListener('click', () => {
    const name = charNameInput.value.toLowerCase();

    // Logic to find the asset
    // Since we are in a prototype, we'll check our mock map or default
    // In the real version, this would call the backend to generate an image

    // For this demo, let's just try to load the artifact path if we know it, 
    // or alert the user.
    // Since I (the AI) know the artifact paths, I can hardcode them here for the DEMO.

    // NOTE: In the real app, we'd use a relative path like '/images/chars/...'
    // For this test, I'll use the placeholder logic.

    console.log(`Generating/Loading ${name}...`);

    // Simulating "Generation" delay
    generateBtn.textContent = "Generating...";
    generateBtn.disabled = true;

    setTimeout(() => {
        generateBtn.textContent = "Generate / Load";
        generateBtn.disabled = false;

        // FALLBACK: Just load a sample image from a URL if local not found
        // Or use the ones I just generated.
        // I will need to move the generated artifacts to a public folder to be accessible by the browser.
        // For now, I'll assume they are in 'public/assets' (I need to move them there).

        engine.loadCharacter(`assets/${name}_sprite.png`);
    }, 1000);
});

// Slider Events
breathSlider.addEventListener('input', (e) => {
    engine.params.breathSpeed = parseFloat(e.target.value);
});

mouthSlider.addEventListener('input', (e) => {
    engine.params.mouthOpen = parseFloat(e.target.value);
});

micBtn.addEventListener('click', async () => {
    micBtn.textContent = "Connecting...";
    const success = await engine.enableMic();
    if (success) {
        micBtn.textContent = "🎤 Mic Active";
        micBtn.style.background = "#4ae24a";
        micBtn.style.color = "black";
    } else {
        micBtn.textContent = "❌ Error";
    }
});
