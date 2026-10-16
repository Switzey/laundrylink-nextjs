"use client";
import { Printer } from "lucide-react";
export function PrintButton(){return <button className="btn-primary print:hidden" type="button" onClick={()=>window.print()}><Printer size={17}/>Print</button>;}
