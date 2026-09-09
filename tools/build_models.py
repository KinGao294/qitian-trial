"""Original low/mid poly art. Run: blender -b --python tools/build_models.py."""
import bpy, math, os, json
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'public/models'); os.makedirs(OUT,exist_ok=True)
stats={}
def material(name,color,texture=None,metal=0):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=.72
 if texture:
  t=m.node_tree.nodes.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(os.path.join(ROOT,'public/textures',texture+'.jpg')); m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
 return m
def empty(name,pos=(0,0,0)):
 o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); o.location=pos; return o
def finish(o,name,pos,scale,mat,parent=None):
 o.name=name; o.location=pos; o.scale=scale; o.data.materials.append(mat)
 if parent:o.parent=parent
 return o
def ell(name,pos,scale,mat,parent=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10);o=finish(bpy.context.object,name,pos,scale,mat,parent)
 for p in o.data.polygons:p.use_smooth=True
 return o
def cube(name,pos,scale,mat,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1);o=finish(bpy.context.object,name,pos,scale,mat,parent)
 bevel=o.modifiers.new('Hand softened edges','BEVEL');bevel.width=.08;bevel.segments=2
 o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o
def cone(name,pos,r1,r2,depth,mat,parent=None):
 bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=r1,radius2=r2,depth=depth)
 return finish(bpy.context.object,name,pos,(1,1,1),mat,parent)
def link(name,a,b,r,mat,parent=None):
 a,b=Vector(a),Vector(b);o=cone(name,(a+b)/2,r,r*.85,(b-a).length,mat,parent);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def curve(name,pts,r,mat,parent=None):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=2
 s=c.splines.new('BEZIER');s.bezier_points.add(len(pts)-1)
 for p,co in zip(s.bezier_points,pts):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(mat);o.parent=parent;return o
def reset():bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def export(name):
 # Convert bevels/curves to web-ready meshes while preserving named animation pivots.
 for o in list(bpy.context.scene.objects):
  if o.type in {'MESH','CURVE'}:
   bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
 stats[name]={'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')}
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',export_yup=True)
reset()
fur=material('Warm umber fur',(.25,.12,.055));skin=material('Golden muzzle',(.65,.4,.19));gold=material('Antique bronze',(.65,.39,.1),metal=.65);red=material('Ritual silk',(.6,.06,.025),'cloth_red');wood=material('Lacquer',(.07,.035,.02),'wood_albedo');black=material('Obsidian',(.015,.02,.018))
# Blender +Z up, -Y forward converts to glTF +Y up, +Z forward.
body=empty('Torso')
ell('Coat chest',(0,0,1.3),(.37,.23,.46),red,body)
cone('Flared coat',(0,0,.93),.45,.3,.6,red,body)
for s in [-1,1]:
 leg=empty('Leg_L' if s<0 else 'Leg_R',(s*.21,0,.77))
 link('Trouser',(0,0,0),(0,0,-.51),.135,black,leg);cube('Bronze shin',(0,-.08,-.39),(.23,.15,.31),gold,leg);ell('Boot',(0,-.13,-.67),(.16,.27,.12),black,leg)
 ell('Shoulder',(s*.42,0,1.54),(.23,.25,.16),gold,body)
 link('Sleeve',(s*.4,0,1.48),(s*.61,-.04,1.1),.15,red,body);ell('Hand',(s*.63,-.08,1.03),(.12,.12,.15),fur,body)
 ell('Ear',(s*.31,0,1.98),(.13,.09,.16),fur,body);ell('Ear inset',(s*.34,-.07,1.98),(.08,.04,.1),skin,body)
ell('Monkey head',(0,0,1.96),(.3,.245,.32),fur,body)
for s in [-1,1]:
 ell('Face mask',(s*.105,-.2,1.99),(.125,.08,.145),skin,body);ell('Eye',(s*.105,-.275,2.025),(.035,.02,.03),black,body)
 link('Brow',(s*.045,-.279,2.09),(s*.17,-.255,2.105),.025,fur,body)
ell('Muzzle',(0,-.255,1.87),(.17,.09,.105),skin,body);ell('Nose',(0,-.338,1.91),(.055,.025,.027),black,body)
cone('Travel hat',(0,.02,2.24),.53,.09,.21,wood,body);cone('Hat bronze rim',(0,.02,2.135),.54,.54,.025,gold,body)
cone('Sash',(0,0,1.02),.365,.365,.12,gold,body)
for s in [-1,1]:
 o=cube('Coat hem panel',(s*.22,-.27,.76),(.3,.065,.52),red,body);o.rotation_euler.y=s*.13
curve('Curled monkey tail',[(0,.17,.91),(.2,.5,.8),(.48,.64,1.04),(.49,.56,1.38),(.3,.46,1.42)],.055,fur,body)
weapon=empty('Weapon',(.65,-.15,1.2));link('Staff shaft',(0,0,-1.35),(0,0,1.65),.042,wood,weapon)
for z in [-1.2,1.5]:
 cone('Staff bronze end',(0,0,z),.066,.066,.34,gold,weapon)
 for dz in [-.13,0,.13]:cone('Staff rings',(0,0,z+dz),.079,.079,.025,gold,weapon)
export('player')
reset()
stone=material('Guardian stone',(.45,.5,.43),'boss_diffuse');jade=material('Carved dark jade',(.07,.15,.13));eye=material('Ember eyes',(1,.29,.035));p=eye.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=(1,.14,.015,1);p.inputs['Emission Strength'].default_value=3
body=empty('Torso');ell('Lion barrel',(0,.15,1.55),(.85,1.03,.75),stone,body);ell('Breast',(0,-.63,1.64),(.85,.55,.9),stone,body)
for s in [-1,1]:
 leg=empty('Leg_L' if s<0 else 'Leg_R',(s*.59,-.6,1.3))
 ell('Foreleg',(0,0,-.45),(.29,.31,.59),stone,leg);ell('Paw',(0,-.18,-1.06),(.36,.48,.24),stone,leg)
 for dx in [-.17,0,.17]:ell('Claw',(dx,-.57,-1.08),(.075,.14,.07),gold,leg)
 ell('Haunch',(s*.64,.85,1.04),(.43,.5,.6),stone,body);ell('Rear paw',(s*.64,.75,.23),(.36,.43,.24),stone,body)
head=empty('Weapon',(0,-.84,2.17))
ell('Lion skull',(0,0,0),(.66,.52,.62),stone,head)
# Ring of individually curled mane locks.
for i in range(16):
 a=i*math.tau/16;x=math.sin(a)*.66;z=math.cos(a)*.65
 ell('Mane curl',(x,.1,z),(.25,.31,.25),jade,head)
 curve('Mane engraving',[(x-.08,-.2,z-.05),(x-.1,-.22,z+.07),(x+.04,-.22,z+.12),(x+.1,-.2,z)],.022,gold,head)
for s in [-1,1]:
 ell('Ear',(s*.51,.04,.56),(.22,.16,.25),stone,head)
 ell('Eye socket',(s*.25,-.44,.15),(.21,.095,.13),jade,head);ell('Glowing eye',(s*.25,-.525,.15),(.105,.028,.05),eye,head)
 link('Fierce brow',(s*.09,-.48,.29),(s*.43,-.39,.34),.085,stone,head)
 ell('Muzzle lobe',(s*.2,-.48,-.17),(.29,.23,.22),stone,head)
 cone('Fang',(s*.26,-.57,-.37),.015,.075,.24,gold,head)
ell('Nose',(0,-.69,-.035),(.2,.08,.12),jade,head);ell('Lower jaw',(0,-.35,-.45),(.42,.32,.16),stone,head)
cone('Forehead crest',(0,-.05,.66),.16,0,.4,gold,head)
curve('Lion tail',[(0,1,1.5),(0,1.6,1.9),(.5,1.65,2.3),(.7,1.35,2.45)],.13,stone,body);ell('Tail tuft',(.7,1.35,2.45),(.25,.23,.25),jade,body)
cone('Collar',(0,-.48,1.75),.84,.84,.14,gold,body).rotation_euler.x=math.pi/2
ell('Ritual medallion',(0,-1.12,1.3),(.21,.08,.24),gold,body)
export('boss')
open(os.path.join(OUT,'stats.json'),'w').write(json.dumps(stats,indent=2))
