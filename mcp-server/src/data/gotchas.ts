import type { Gotcha } from "../types";

export const PLATFORM_GOTCHAS: Gotcha[] = [
  {
    id: "rpc-broadcast-fires-on-caller",
    title: "[Rpc.Broadcast] fires on the calling host — use an IsProxy guard to prevent double-execution",
    tags: ["networking", "rpc"],
    wrongPattern: `// Wrong: assumes [Rpc.Broadcast] does not fire on the calling host
[Rpc.Broadcast]
public void SpawnPickup()
{
    CreatePickupObject(); // executes on host AND all clients — object spawns twice
}`,
    wrongReason:
      "[Rpc.Broadcast] executes the method body on the host immediately AND replicates the call to all clients. The host (caller) is not excluded — it runs the method locally and remotely.",
    fix: `// Right: guard against double-execution on the calling host
[Rpc.Broadcast]
public void SpawnPickup()
{
    if ( !IsProxy ) return; // host already ran this locally; skip the replicated copy
    CreatePickupObject();
}`,
    fixReason:
      "IsProxy is false on the authoritative connection (host/owner). Returning early when !IsProxy prevents the method body from running twice on the host.",
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },

  {
    id: "isproxy-unreliable-with-ownertransfer-takeover",
    title: "IsProxy is unreliable in the frame after TakeOwnership() with OwnerTransfer.Takeover",
    tags: ["networking", "ownership"],
    wrongPattern: `// Wrong: reads IsProxy immediately after TakeOwnership with OwnerTransfer.Takeover
go.SetupNetworking( OwnerTransfer.Takeover, NetworkOrphaned.Host );
go.TakeOwnership();
if ( !go.IsProxy ) { /* ownership confirmed */ } // unreliable — may still read as true`,
    wrongReason:
      "OwnerTransfer.Takeover requests an ownership transfer, but IsProxy is updated asynchronously after the network round-trip. Reading it in the same frame as TakeOwnership() may return the stale value.",
    fix: `// Right: defer IsProxy checks to OnNetworkOwnerChanged
public override void OnNetworkOwnerChanged( Connection previousOwner )
{
    if ( !IsProxy ) { /* ownership confirmed — IsProxy is stable here */ }
}`,
    fixReason:
      "OnNetworkOwnerChanged fires after the engine has committed the new owner state and updated IsProxy. Reading IsProxy inside this callback is reliable.",
    apiTypes: ["GameObject"],
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },

  {
    id: "rpc-host-method-must-not-be-virtual",
    title: "[Rpc.Host] methods must not be virtual — the engine cannot resolve a concrete dispatch target",
    tags: ["networking", "rpc"],
    wrongPattern: `// Wrong: [Rpc.Host] on a virtual method
[Rpc.Host]
public virtual void OnPlayerAction( int playerId ) { }`,
    wrongReason:
      "The s&box RPC system does not support virtual dispatch on [Rpc.Host] methods. At runtime the engine throws when it cannot resolve a single concrete target for the RPC call.",
    fix: `// Right: [Rpc.Host] methods must be non-virtual
[Rpc.Host]
public void OnPlayerAction( int playerId ) { }`,
    fixReason:
      "Non-virtual methods have a single concrete implementation the RPC system can target unambiguously. Polymorphic behaviour must be achieved via composition rather than inheritance.",
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },

  {
    id: "findmode-everythinginself-does-not-search-ancestors",
    title: "FindMode.EverythingInSelf searches descendants only — it does not walk up to parent objects",
    tags: ["scene", "components"],
    wrongPattern: `// Wrong: expects FindMode.EverythingInSelf to search up the hierarchy
var rb = Components.Get<Rigidbody>( FindMode.EverythingInSelf );
// Returns null if Rigidbody is on a parent — only searches this object and its children`,
    wrongReason:
      "FindMode.EverythingInSelf searches the current object and all of its descendants, but does NOT traverse up to ancestor objects. A component on a parent GameObject is invisible to this mode.",
    fix: `// Right: use FindMode.EverythingInSelfAndAncestors to include parents
var rb = Components.Get<Rigidbody>( FindMode.EverythingInSelfAndAncestors );`,
    fixReason:
      "FindMode.EverythingInSelfAndAncestors walks both descendants and ancestors from the current object, covering the full expected hierarchy in both directions.",
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },

  {
    id: "highlight-outline-must-be-on-root-gameobject",
    title: "HighlightOutline must be on the root GameObject — placing it on a child produces no visible effect",
    tags: ["rendering", "components"],
    wrongPattern: `// Wrong: HighlightOutline added to a child GameObject
var childGo = parentGo.Children.First();
childGo.Components.Create<HighlightOutline>();
// Outline renders incorrectly or not at all`,
    wrongReason:
      "HighlightOutline computes its stencil mask from the root of the rendered hierarchy. When placed on a child object it cannot access the full mesh bounds and silently produces no visible outline.",
    fix: `// Right: HighlightOutline belongs on the root GameObject
rootGo.Components.Create<HighlightOutline>();`,
    fixReason:
      "On the root object, HighlightOutline can enumerate all child renderers and build the correct stencil bounds covering the full model.",
    apiTypes: ["Component"],
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },

  {
    id: "worldpanel-panelsize-vs-renderscale",
    title: "WorldPanel.PanelSize (virtual canvas) and RenderScale (pixel resolution) are independent — both must be set",
    tags: ["ui", "worldpanel"],
    wrongPattern: `// Wrong: only sets PanelSize, leaving RenderScale at its default
var panel = Components.Get<WorldPanel>();
panel.PanelSize = new Vector2( 1024, 512 );
// Result: blurry or incorrectly scaled panel texture`,
    wrongReason:
      "PanelSize controls the virtual canvas dimensions used for layout calculations. RenderScale is a separate property that controls the physical pixel resolution of the texture. Leaving one at default produces a size/resolution mismatch.",
    fix: `// Right: configure both PanelSize (layout) and RenderScale (pixels) explicitly
var panel = Components.Get<WorldPanel>();
panel.PanelSize = new Vector2( 1024, 512 );
panel.RenderScale = 1.0f; // 1:1 pixel mapping; increase for sharper text`,
    fixReason:
      "PanelSize and RenderScale are independent settings. Setting both explicitly gives predictable, crisp rendering at the intended size.",
    apiTypes: ["WorldPanel"],
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },

  {
    id: "realtime-now-vs-time-now",
    title: "RealTime.Now is wall-clock uptime; Time.Now is game time — using Time.Now for UI cooldowns pauses when the game pauses",
    tags: ["time", "game-loop"],
    wrongPattern: `// Wrong: uses Time.Now expecting wall-clock time
float elapsed = Time.Now - spawnTime; // stops advancing when the game is paused`,
    wrongReason:
      "Time.Now is game time — it stops advancing when the game is paused. Using it for real-world durations such as UI cooldowns or session timers produces incorrect results in paused states.",
    fix: `// Right: use RealTime.Now for wall-clock durations
float elapsed = RealTime.Now - spawnRealTime; // always advances regardless of pause state`,
    fixReason:
      "RealTime.Now is wall-clock uptime and never pauses. Use Time.Now only when you want time to pause with the game (e.g. animation timers, physics-tied delays).",
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },

  {
    id: "use-scene-getallcomponents-not-findobjectoftype",
    title: "FindObjectOfType<T>() is a Unity API — use Scene.GetAllComponents<T>() in s&box",
    tags: ["scene", "unity-ism"],
    wrongPattern: `// Wrong: Unity API does not exist in s&box
var manager = FindObjectOfType<GameManager>();`,
    wrongReason:
      "FindObjectOfType<T>() is a Unity static method. It does not exist in s&box and will fail to compile.",
    fix: `// Right: use Scene.GetAllComponents<T>() instead
var manager = Scene.GetAllComponents<GameManager>().FirstOrDefault();`,
    fixReason:
      "Scene.GetAllComponents<T>() is the s&box equivalent. It searches all active GameObjects in the current scene and returns an IEnumerable<T>.",
    apiTypes: ["Component"],
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },

  {
    id: "camera-main-does-not-exist",
    title: "Camera.Main does not exist in s&box — use Scene.Camera instead",
    tags: ["camera", "unity-ism"],
    wrongPattern: `// Wrong: Unity API does not exist in s&box
var cam = Camera.Main;`,
    wrongReason:
      "Camera.Main is a Unity static property. The s&box Camera class has no Main property and this will fail to compile.",
    fix: `// Right: access the active camera through the scene
var cam = Scene.Camera;`,
    fixReason:
      "Scene.Camera returns the currently active camera for the scene and is the s&box equivalent of Camera.main.",
    apiTypes: ["Camera"],
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },

  {
    id: "mouse-visible-is-obsolete",
    title: "Mouse.Visible is obsolete — use Input.MouseMode to control cursor visibility",
    tags: ["ui", "input"],
    wrongPattern: `// Wrong: obsolete API — has no effect on current engine versions
Mouse.Visible = true;`,
    wrongReason:
      "Mouse.Visible has been removed from the s&box API. On engine versions where it compiles it produces no effect, silently failing to show or hide the cursor.",
    fix: `// Right: use Input.MouseMode to control cursor visibility
Input.MouseMode = MouseMode.Normal;   // shows cursor
// Input.MouseMode = MouseMode.Locked; // hides and locks cursor to window`,
    fixReason:
      "Input.MouseMode is the current API for cursor control. MouseMode.Normal shows the cursor; MouseMode.Locked hides it and locks it to the window center.",
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },

  {
    id: "ownertransfer-takeover-breaks-isproxy-host-managed",
    title: "OwnerTransfer.Takeover on a host-managed object leaves IsProxy indeterminate for 1–2 frames",
    tags: ["networking", "ownership", "host"],
    wrongPattern: `// Wrong: IsProxy guard runs during the ownership transfer window
void Update()
{
    if ( !IsProxy )
    {
        ApplyAuthoritative(); // may execute on the wrong connection during the transfer
    }
}`,
    wrongReason:
      "When OwnerTransfer.Takeover is used on a previously host-managed object (no prior owner), the transition leaves IsProxy in an indeterminate state on the host for 1–2 frames. An Update-tick guard that reads IsProxy during this window may run authority logic on the wrong connection.",
    fix: `// Right: perform authority checks inside OnNetworkOwnerChanged
public override void OnNetworkOwnerChanged( Connection previous )
{
    if ( !IsProxy ) ApplyAuthoritative(); // IsProxy is stable at this point
}`,
    fixReason:
      "OnNetworkOwnerChanged is called after the engine has fully committed the new owner state. IsProxy is guaranteed to reflect the final ownership when this callback fires.",
    apiTypes: ["GameObject"],
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },

  {
    id: "iuse-removed-use-ipressable",
    title: "IUse was removed from s&box — implement IPressable instead",
    tags: ["interaction", "interface", "api-change"],
    wrongPattern: `// Wrong: IUse was removed from s&box
public class Door : Component, IUse
{
    public void OnUse( GameObject user ) { Open(); }
}`,
    wrongReason:
      "The IUse interface was removed from the s&box API. Any component implementing it will fail to compile on current engine versions.",
    fix: `// Right: implement IPressable instead
public class Door : Component, IPressable
{
    public void OnPress( GameObject presser ) { Open(); }
}`,
    fixReason:
      "IPressable is the replacement for IUse. It uses the same press-to-interact model with a renamed method signature: OnPress(GameObject presser).",
    apiTypes: ["IPressable"],
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },

  {
    id: "disabling-rigidbody-does-not-disable-colliders",
    title: "Disabling a Rigidbody component does not disable its colliders — they remain active and block movement",
    tags: ["physics", "colliders"],
    wrongPattern: `// Wrong: disabling Rigidbody does not stop collision detection
var rb = Components.Get<Rigidbody>();
rb.Enabled = false; // colliders still active — object blocks movement and raycasts`,
    wrongReason:
      "Rigidbody and collider components are independent in s&box. Disabling the Rigidbody stops physics simulation (forces, velocity, gravity) but leaves all collider shapes active. The object continues to block raycasts and character movement.",
    fix: `// Right: disable both the Rigidbody and all colliders explicitly
var rb = Components.Get<Rigidbody>();
rb.Enabled = false;
foreach ( var col in Components.GetAll<Collider>( FindMode.EverythingInSelf ) )
    col.Enabled = false;`,
    fixReason:
      "Collider components must be disabled independently of the Rigidbody. Using FindMode.EverythingInSelf covers all child colliders, not only those on the root object.",
    apiTypes: ["Component"],
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },

  {
    id: "reenabling-collider-overlapping-capsule-launches-physics",
    title: "Re-enabling a collider while a physics body overlaps it generates a large impulse that can launch the body",
    tags: ["physics", "colliders"],
    wrongPattern: `// Wrong: re-enables a collider without considering overlapping physics bodies
col.Enabled = true; // if a rigidbody overlaps, penetration resolution launches it at high velocity`,
    wrongReason:
      "When a collider is re-enabled while a physics body already overlaps its volume, the engine resolves the penetration in a single frame by applying an impulse. This impulse can launch the overlapping body at high velocity — a common source of prop-launch bugs near walls or floors.",
    fix: `// Right: suppress physics motion during the re-enable window to prevent the launch impulse
rb.MotionEnabled = false;
col.Enabled = true;
await Task.DelaySeconds( 0.1f );
rb.MotionEnabled = true;`,
    fixReason:
      "Setting MotionEnabled = false before re-enabling the collider prevents the engine from generating the penetration-resolution impulse. The brief delay allows the engine to settle the new geometry before physics forces resume.",
    apiTypes: ["PhysicsBody"],
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },

  {
    id: "scene-editor-serialization-overwrites-code-state",
    title: "The scene editor serializes [Property] values — runtime code assignments are overwritten on next scene load",
    tags: ["serialization", "editor", "components"],
    wrongPattern: `// Wrong: relies on code to persist [Property] state across editor reloads
public class SpawnPoint : Component
{
    [Property] public int MaxPlayers { get; set; } = 4;
}
// Somewhere at runtime: spawnPoint.MaxPlayers = 8;
// After editor reloads the scene, MaxPlayers resets to 4`,
    wrongReason:
      "The s&box scene editor serializes [Property] field values to the scene file. When the scene is reloaded, the editor restores the serialized value (4), overwriting any runtime assignment (8) that was set in code during a previous session.",
    fix: `// Right: [Property] is editor-authoritative; keep runtime state in separate non-serialized fields
public class SpawnPoint : Component
{
    [Property] public int MaxPlayers { get; set; } = 4; // editor owns this
    private int _runtimeMaxPlayers;                     // code owns this — not persisted
}`,
    fixReason:
      "[Property] fields belong to the scene editor and are always restored from the scene file on load. Runtime-only state must live in non-serialized fields or separate configuration objects that are not touched by the editor.",
    apiTypes: ["Component"],
    confirmedVersion: "2026-06-05-18-09-57",
    lastVerified: "2026-06-05-18-09-57",
    confirmedBy: "casino-project",
    confidence: "single-source",
    source: "platform",
  },
];
