#!/usr/bin/env python3
"""Leader bible-locked cel chibi renderer. Run: python3 render_leader.py"""
from PIL import Image, ImageDraw
import math, os

OUT = os.path.dirname(os.path.abspath(__file__))
SIZE = 512
GREEN=(0x1B,0x7A,0x4A,255); GREEN_DK=(0x14,0x5C,0x38,255)
GOLD=(0xE6,0xB4,0x22,255); GOLD_DK=(0xB8,0x8A,0x10,255)
SKIN=(0xF5,0xE6,0xD3,255); HAIR=(0x2A,0x2A,0x2E,255)
SHIRT=(0xF4,0xF4,0xF6,255); SHIRT_DK=(0xD0,0xD0,0xD6,255)
PANTS=(0x2F,0x36,0x3F,255); PANTS_DK=(0x1E,0x22,0x28,255)
OUTLINE=(0x10,0x10,0x12,255); WHITE=(255,255,255,255); IRIS=(0x1E,0x1E,0x22,255)
CHEEK=(0xF0,0xB0,0xA0,160); ALERT_Y=(0xFF,0xD4,0x4A,255); ALERT_R=(0xE8,0x3B,0x3B,255)

def ellipse(d,box,fill,ow=5): d.ellipse(box,fill=fill,outline=OUTLINE,width=ow)
def rrect(d,box,r,fill,ow=5): d.rounded_rectangle(box,radius=r,fill=fill,outline=OUTLINE,width=ow)
def thick_line(d,a,b,fill,width,oe=5):
    d.line([a,b],fill=OUTLINE,width=width+oe); d.line([a,b],fill=fill,width=width)

def draw_leader(pose="idle", scale=1.0):
    im=Image.new("RGBA",(SIZE,SIZE),(0,0,0,0)); d=ImageDraw.Draw(im); s=scale; ow=max(3,int(5*s))
    cx=SIZE//2; H=int(400*s); foot_y=int(SIZE*0.88); top_y=foot_y-H
    lean=int(36*s) if pose=="working" else 0; body_ox=int(12*s); face_ox=int(-8*s)
    head_r=int(H*0.26); head_cy=top_y+head_r+int(6*s)+lean//4; head_cx=cx+lean//2+int(2*s)
    hip_y=foot_y-int(56*s); torso_h=int(72*s); torso_w=int(86*s)
    torso_top=hip_y-torso_h+int(12*s); body_cx=cx+body_ox+lean
    leg_w=int(30*s)
    for off,col in [(-int(20*s),PANTS),(int(16*s),PANTS_DK)]:
        x0=body_cx+off-leg_w//2; fy=foot_y+(int(4*s) if pose=="working" and off>0 else 0)
        rrect(d,[x0,hip_y-int(4*s),x0+leg_w,fy-int(10*s)],int(12*s),col,ow)
        ellipse(d,[x0-int(3*s),fy-int(18*s),x0+leg_w+int(8*s),fy],PANTS_DK,ow)
    rrect(d,[body_cx-torso_w//2,torso_top,body_cx+torso_w//2,hip_y+int(6*s)],int(20*s),SHIRT,ow)
    d.line([(body_cx+int(4*s),torso_top+int(16*s)),(body_cx+int(4*s),hip_y)],fill=SHIRT_DK,width=max(2,int(3*s)))
    shoulder_y=torso_top+int(16*s); arm_w=int(22*s); hand_r=int(14*s) if s>0.8 else int(11*s)
    def draw_hand(hx,hy): ellipse(d,[hx-hand_r,hy-hand_r,hx+hand_r,hy+hand_r],SKIN,ow)
    def sleeve(sx,sy): ellipse(d,[sx-int(15*s),sy-int(11*s),sx+int(15*s),sy+int(13*s)],SHIRT,ow)
    Lsx=body_cx-(torso_w//2-int(4*s)); Rsx=body_cx+(torso_w//2-int(4*s)); sy=shoulder_y
    if pose=="working":
        for sx,ex in ((Lsx,body_cx+int(8*s)),(Rsx,body_cx+int(52*s))):
            ey=hip_y+int(10*s); thick_line(d,(sx,sy),(ex,ey),SKIN,arm_w+2,ow); sleeve(sx,sy); draw_hand(ex,ey)
    elif pose=="wave":
        thick_line(d,(Lsx,sy),(Lsx-int(16*s),hip_y-int(6*s)),SKIN,arm_w,ow); sleeve(Lsx,sy); draw_hand(Lsx-int(16*s),hip_y-int(6*s))
        mid=(Rsx+int(8*s),sy-int(50*s)); tip=(Rsx+int(18*s),head_cy-head_r-int(8*s))
        thick_line(d,(Rsx,sy),mid,SKIN,arm_w+2,ow); thick_line(d,mid,tip,SKIN,arm_w+2,ow); sleeve(Rsx,sy); draw_hand(*tip)
        hx,hy=tip
        for ang in (-40,-10,20,50):
            a=math.radians(-90+ang); fx=hx+int((hand_r+8*s)*math.cos(a)); fy=hy+int((hand_r+8*s)*math.sin(a))
            ellipse(d,[fx-int(4*s),fy-int(7*s),fx+int(4*s),fy+int(7*s)],SKIN,2)
    elif pose=="alert":
        for sx,side in ((Lsx,-1),(Rsx,1)):
            ex=sx+side*int(28*s); ey=sy-int(18*s); thick_line(d,(sx,sy),(ex,ey),SKIN,arm_w,ow); sleeve(sx,sy); draw_hand(ex,ey)
    else:
        for sx,side in ((Lsx,-1),(Rsx,1)):
            ex=sx+side*int(20*s); ey=hip_y-int(4*s); thick_line(d,(sx,sy),(ex,ey),SKIN,arm_w,ow); sleeve(sx,sy); draw_hand(ex,ey)
    scarf_cy=torso_top+int(2*s)
    ellipse(d,[body_cx-int(50*s),scarf_cy-int(16*s),body_cx+int(50*s),scarf_cy+int(34*s)],GREEN,ow)
    ellipse(d,[body_cx-int(30*s),scarf_cy-int(4*s),body_cx+int(32*s),scarf_cy+int(18*s)],GREEN_DK,max(2,ow-2))
    d.polygon([(body_cx-int(6*s),scarf_cy+int(18*s)),(body_cx-int(26*s),scarf_cy+int(72*s)),(body_cx-int(6*s),scarf_cy+int(60*s)),(body_cx+int(10*s),scarf_cy+int(24*s))],fill=GREEN_DK)
    d.line([(body_cx-int(6*s),scarf_cy+int(18*s)),(body_cx-int(26*s),scarf_cy+int(72*s)),(body_cx-int(6*s),scarf_cy+int(60*s)),(body_cx+int(10*s),scarf_cy+int(24*s)),(body_cx-int(6*s),scarf_cy+int(18*s))],fill=OUTLINE,width=ow)
    d.polygon([(body_cx+int(6*s),scarf_cy+int(14*s)),(body_cx+int(14*s),scarf_cy+int(54*s)),(body_cx+int(30*s),scarf_cy+int(48*s)),(body_cx+int(24*s),scarf_cy+int(12*s))],fill=GREEN)
    d.line([(body_cx+int(6*s),scarf_cy+int(14*s)),(body_cx+int(14*s),scarf_cy+int(54*s)),(body_cx+int(30*s),scarf_cy+int(48*s)),(body_cx+int(24*s),scarf_cy+int(12*s)),(body_cx+int(6*s),scarf_cy+int(14*s))],fill=OUTLINE,width=ow)
    px,py,pr=body_cx+int(24*s),scarf_cy+int(8*s),int(11*s); ellipse(d,[px-pr,py-pr,px+pr,py+pr],GOLD,ow)
    d.ellipse([px-int(3*s),py-int(3*s),px+int(3*s),py+int(3*s)],fill=GOLD_DK)
    hr=head_r; ellipse(d,[head_cx-hr,head_cy-hr,head_cx+hr,head_cy+hr],SKIN,max(4,int(6*s)))
    d.pieslice([head_cx-hr-int(2*s),head_cy-hr-int(10*s),head_cx+hr+int(2*s),head_cy+int(36*s)],200,340,fill=HAIR,outline=OUTLINE,width=ow)
    d.polygon([(head_cx-int(48*s),head_cy-hr+int(22*s)),(head_cx-int(28*s),head_cy-int(8*s)),(head_cx-int(8*s),head_cy-hr+int(20*s)),(head_cx+int(8*s),head_cy-int(4*s)),(head_cx+int(28*s),head_cy-hr+int(18*s)),(head_cx+int(48*s),head_cy-int(10*s)),(head_cx+hr-int(6*s),head_cy-hr+int(28*s)),(head_cx-hr+int(6*s),head_cy-hr+int(30*s))],fill=HAIR)
    ellipse(d,[head_cx+hr-int(30*s),head_cy-int(8*s),head_cx+hr+int(6*s),head_cy+int(38*s)],HAIR,ow)
    d.pieslice([head_cx-hr,head_cy-hr,head_cx+hr,head_cy+hr],350,90,fill=SKIN)
    d.arc([head_cx-hr,head_cy-hr,head_cx+hr,head_cy+hr],0,360,fill=OUTLINE,width=max(3,int(5*s)))
    eye_y=head_cy-int(4*s); eye_dx=int(30*s); erx,ery=int(17*s),int(19*s)
    for side in (-1,1):
        ex=head_cx+face_ox+side*eye_dx; ellipse(d,[ex-erx,eye_y-ery,ex+erx,eye_y+ery],WHITE,max(3,int(4*s)))
        ir=int(10*s) if pose=="alert" else int(9*s); ix=ex+int(3*s); iy=eye_y+(0 if pose=="alert" else int(3*s))
        ellipse(d,[ix-ir,iy-ir,ix+ir,iy+ir],IRIS,max(2,int(3*s))); hs=max(2,int(4*s))
        d.ellipse([ix-hs,iy-ir+int(2*s),ix,iy-ir+int(2*s)+hs],fill=WHITE)
        brow=int(-8*s) if pose=="alert" else int(-2*s)
        d.arc([ex-erx,eye_y-ery+brow-int(10*s),ex+erx,eye_y-ery+brow+int(8*s)],200,340,fill=OUTLINE,width=max(2,int(4*s)))
    for side in (-1,1):
        chx=head_cx+face_ox+side*int(44*s); chy=eye_y+int(24*s)
        d.ellipse([chx-int(9*s),chy-int(5*s),chx+int(9*s),chy+int(5*s)],fill=CHEEK)
    mx=head_cx+face_ox; my=head_cy+int(36*s)
    if pose=="alert": ellipse(d,[mx-int(9*s),my-int(5*s),mx+int(9*s),my+int(11*s)],(0x4A,0x30,0x30,255),max(2,int(3*s)))
    elif pose=="working": d.arc([mx-int(14*s),my-int(6*s),mx+int(14*s),my+int(10*s)],30,150,fill=OUTLINE,width=max(2,int(3*s)))
    elif pose=="wave": d.arc([mx-int(22*s),my-int(12*s),mx+int(22*s),my+int(18*s)],15,165,fill=OUTLINE,width=max(3,int(5*s)))
    else: d.arc([mx-int(18*s),my-int(10*s),mx+int(18*s),my+int(14*s)],25,155,fill=OUTLINE,width=max(2,int(4*s)))
    if pose=="alert":
        bx=head_cx+hr+int(4*s); by=head_cy-hr-int(20*s); br=int(32*s)
        ellipse(d,[bx-br,by-br,bx+br,by+br],ALERT_Y,max(3,int(5*s)))
        d.rectangle([bx-int(5*s),by-int(16*s),bx+int(5*s),by+int(4*s)],fill=ALERT_R,outline=OUTLINE,width=2)
        ellipse(d,[bx-int(6*s),by+int(8*s),bx+int(6*s),by+int(20*s)],ALERT_R,2)
        for ang in (45,165,270):
            a=math.radians(ang); sx_=bx+int(br*1.4*math.cos(a)); sy_=by+int(br*1.4*math.sin(a)); sr=int(6*s)
            ellipse(d,[sx_-sr,sy_-sr,sx_+sr,sy_+sr],ALERT_Y,2)
    return im

if __name__=="__main__":
    specs=[("leader_hero_ref.png","idle",1.0),("leader_desk_idle.png","idle",1.0),
           ("leader_desk_working.png","working",1.0),("leader_ready_review.png","wave",1.0),
           ("leader_needs_permission.png","alert",1.0),("leader_intern_idle.png","intern_idle",0.70)]
    frames=[]
    for name,pose,sc in specs:
        im=draw_leader(pose,sc); p=os.path.join(OUT,name); im.save(p,"PNG"); frames.append(im); print("wrote",p)
    pad,cell,lh=16,512,36; cols=len(frames)
    strip=Image.new("RGBA",(cols*cell+(cols+1)*pad, cell+pad*2+lh),(0x1A,0x1A,0x22,255))
    sd=ImageDraw.Draw(strip); labels=["hero_ref","desk_idle","working","ready_review","needs_perm","intern_idle"]
    for i,im in enumerate(frames):
        x=pad+i*(cell+pad); strip.alpha_composite(im,(x,pad+lh)); sd.text((x+8,10),labels[i],fill=(0xCC,0xCC,0xD8,255))
    strip.convert("RGB").save(os.path.join(OUT,"preview_strip.png")); print("preview ok")
